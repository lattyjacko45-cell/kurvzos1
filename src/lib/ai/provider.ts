/**
 * Model-provider adapter.
 *
 * KurvzOS had no AI provider before this milestone, so rather than commit to a
 * vendor SDK this is a thin HTTP adapter. Harper only ever calls
 * `generateStructured`, so swapping or adding a provider later means editing
 * this file and nothing else.
 *
 * Nothing here throws on import and no key is ever hardcoded — a missing
 * credential produces a setup state.
 */

export type AiProviderName = "anthropic" | "openai";

export interface AiSetupState {
  configured: boolean;
  provider: AiProviderName | null;
  /** Env var names the user still needs to set. */
  missing: string[];
}

export interface AiProviderConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
}

const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5-mini",
};

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Floor that leaves room for reasoning tokens plus a full JSON answer. */
const MIN_OPENAI_OUTPUT_TOKENS = 2048;

function readProviderName(): AiProviderName | null {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (raw === "anthropic" || raw === "openai") return raw;

  // Infer from whichever key is present, so a single key is enough to start.
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";

  return null;
}

export function getAiSetupState(): AiSetupState {
  const provider = readProviderName();

  if (!provider) {
    return {
      configured: false,
      provider: null,
      missing: ["AI_PROVIDER", "ANTHROPIC_API_KEY or OPENAI_API_KEY"],
    };
  }

  const keyName =
    provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const apiKey = process.env[keyName];

  return {
    configured: Boolean(apiKey),
    provider,
    missing: apiKey ? [] : [keyName],
  };
}

function getConfig(): AiProviderConfig | null {
  const state = getAiSetupState();
  if (!state.configured || !state.provider) return null;

  const keyName =
    state.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";

  return {
    provider: state.provider,
    apiKey: process.env[keyName] as string,
    model: process.env.AI_MODEL?.trim() || DEFAULT_MODELS[state.provider],
  };
}

export class AiUnavailableError extends Error {
  constructor(message = "No AI provider is configured.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Where in the pipeline a request died. Safe to log. */
export type AiFailureStage =
  | "http"
  | "empty-output"
  | "incomplete-output"
  | "no-json"
  | "json-parse"
  | "schema";

export interface AiFailureDiagnostics {
  provider: AiProviderName;
  model: string;
  stage: AiFailureStage;
  status?: number;
  /** Provider error identifiers only — never a message body. */
  errorCode?: string;
  errorType?: string;
  errorParam?: string;
}

export class AiRequestError extends Error {
  readonly diagnostics?: AiFailureDiagnostics;

  constructor(message: string, diagnostics?: AiFailureDiagnostics) {
    super(message);
    this.name = "AiRequestError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Server-only diagnostics.
 *
 * Deliberately narrow: provider, model, HTTP status, the provider's own error
 * code/type/param, and the stage that failed. Never the API key, the
 * Authorization header, prompt text, workspace data, or a raw response body.
 */
export function logAiFailure(diagnostics: AiFailureDiagnostics): void {
  console.error("[ai] model request failed", {
    provider: diagnostics.provider,
    model: diagnostics.model,
    stage: diagnostics.stage,
    status: diagnostics.status ?? null,
    errorCode: diagnostics.errorCode ?? null,
    errorType: diagnostics.errorType ?? null,
    errorParam: diagnostics.errorParam ?? null,
  });
}

/** Pulls only the safe identifier fields out of a provider error payload. */
function readErrorIdentifiers(payload: unknown): {
  errorCode?: string;
  errorType?: string;
  errorParam?: string;
} {
  if (!payload || typeof payload !== "object") return {};

  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return {};

  const { code, type, param } = error as {
    code?: unknown;
    type?: unknown;
    param?: unknown;
  };

  return {
    errorCode: typeof code === "string" ? code : undefined,
    errorType: typeof type === "string" ? type : undefined,
    errorParam: typeof param === "string" ? param : undefined,
  };
}

/**
 * A JSON Schema an executive wants the model to conform to.
 *
 * For OpenAI this is sent as a strict `json_schema` response format, which the
 * API enforces during decoding — the model cannot return prose. Providers
 * without that capability fall back to the prompt wording plus the defensive
 * parser below.
 *
 * OpenAI strict mode requires every property to appear in `required` and
 * `additionalProperties: false`; optional fields are expressed as nullable
 * types rather than omitted keys.
 */
export interface JsonSchemaSpec {
  /** Identifier sent to the provider, e.g. "sophia_advice". */
  name: string;
  schema: Record<string, unknown>;
}

/** Minimal shape of a Zod schema, so this module needn't import zod. */
export interface StructuredValidator<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } };
}

export interface StructuredRequest<T = unknown> {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  /** Enables provider-enforced structured output where supported. */
  jsonSchema?: JsonSchemaSpec;
  /** Final gate: output that fails this is rejected, never patched up. */
  validator?: StructuredValidator<T>;
}

/** Pulls the first JSON object out of a model reply. */
function extractJson(text: string, config: AiProviderConfig): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    const diagnostics: AiFailureDiagnostics = {
      provider: config.provider,
      model: config.model,
      stage: "no-json",
    };

    logAiFailure(diagnostics);
    throw new AiRequestError("The model did not return JSON.", diagnostics);
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    const diagnostics: AiFailureDiagnostics = {
      provider: config.provider,
      model: config.model,
      stage: "json-parse",
    };

    logAiFailure(diagnostics);
    throw new AiRequestError("The model returned malformed JSON.", diagnostics);
  }
}

async function callAnthropic(
  config: AiProviderConfig,
  request: StructuredRequest
): Promise<string> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: request.maxTokens ?? 1024,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // Identifiers only: a provider error body can echo the request.
    const errorPayload: unknown = await response.json().catch(() => null);
    const diagnostics: AiFailureDiagnostics = {
      provider: "anthropic",
      model: config.model,
      stage: "http",
      status: response.status,
      ...readErrorIdentifiers(errorPayload),
    };

    logAiFailure(diagnostics);
    throw new AiRequestError(
      `Model request failed (${response.status}).`,
      diagnostics
    );
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  if (!text) {
    const diagnostics: AiFailureDiagnostics = {
      provider: "anthropic",
      model: config.model,
      stage: "empty-output",
      status: response.status,
    };

    logAiFailure(diagnostics);
    throw new AiRequestError(
      "The model returned an empty response.",
      diagnostics
    );
  }

  return text;
}

/** Shape of the bits of a Responses API payload we actually read. */
interface OpenAiResponsePayload {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

/**
 * Extracts assistant text from a Responses API payload.
 *
 * `output_text` is a convenience getter synthesised by the OpenAI SDK — it does
 * not exist on the raw HTTP JSON, so we walk the real structure: `output` is a
 * list of items, and the assistant's words live in the `message` item's
 * `content` entries of type `output_text`. Reasoning models put a `reasoning`
 * item in that same array first, which is why we filter by item type rather
 * than taking `output[0]`.
 */
export function extractOpenAiText(payload: OpenAiResponsePayload): string {
  const messages = (payload.output ?? []).filter(
    (item) => item.type === "message"
  );

  const text = messages
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return text;
}

async function callOpenAi(
  config: AiProviderConfig,
  request: StructuredRequest
): Promise<string> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      // System prompt belongs in `instructions` on the Responses API.
      instructions: request.systemPrompt,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: request.userPrompt }],
        },
      ],
      // Reasoning models (the gpt-5 family) spend part of this budget on
      // internal reasoning before emitting a message. A caller's 900-token
      // ask can be consumed entirely, leaving an empty message and a silent
      // fallback — hence the floor.
      max_output_tokens: Math.max(request.maxTokens ?? 0, MIN_OPENAI_OUTPUT_TOKENS),
      // Strict json_schema is enforced during decoding, so the model cannot
      // return prose or a fenced block. json_object is the weaker fallback for
      // callers that supply no schema.
      text: request.jsonSchema
        ? {
            format: {
              type: "json_schema",
              name: request.jsonSchema.name,
              strict: true,
              schema: request.jsonSchema.schema,
            },
          }
        : { format: { type: "json_object" } },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorPayload: unknown = await response.json().catch(() => null);
    const diagnostics: AiFailureDiagnostics = {
      provider: "openai",
      model: config.model,
      stage: "http",
      status: response.status,
      ...readErrorIdentifiers(errorPayload),
    };

    logAiFailure(diagnostics);
    throw new AiRequestError(
      `Model request failed (${response.status}).`,
      diagnostics
    );
  }

  const payload = (await response.json()) as OpenAiResponsePayload;
  const text = extractOpenAiText(payload);

  if (!text) {
    // A truncated reasoning response is the usual cause of an empty message.
    const stage: AiFailureStage =
      payload.status === "incomplete" ? "incomplete-output" : "empty-output";

    const diagnostics: AiFailureDiagnostics = {
      provider: "openai",
      model: config.model,
      stage,
      status: response.status,
      errorCode: payload.incomplete_details?.reason,
    };

    logAiFailure(diagnostics);
    throw new AiRequestError(
      "The model returned an empty response.",
      diagnostics
    );
  }

  return text;
}

/**
 * Sends a prompt and returns structured output.
 *
 * Three layers, strongest first:
 *  1. Provider-enforced schema (`jsonSchema`) where the API supports it.
 *  2. A defensive parser that strips markdown fences and isolates the JSON
 *     object — for providers without enforcement, or older models.
 *  3. The caller's Zod validator (`validator`), which rejects anything that
 *     still does not match. Rejection throws, so callers fall back rather than
 *     rendering malformed advice.
 */
export async function generateStructured<T = unknown>(
  request: StructuredRequest<T>
): Promise<T> {
  const config = getConfig();
  if (!config) throw new AiUnavailableError();

  const text =
    config.provider === "anthropic"
      ? await callAnthropic(config, request)
      : await callOpenAi(config, request);

  const parsed = extractJson(text, config);

  if (!request.validator) return parsed as T;

  const validated = request.validator.safeParse(parsed);

  if (!validated.success) {
    const diagnostics: AiFailureDiagnostics = {
      provider: config.provider,
      model: config.model,
      stage: "schema",
      // Field paths only — never the offending values.
      errorParam: validated.error.issues
        .map((issue) => issue.path.join(".") || "(root)")
        .join(", "),
    };

    logAiFailure(diagnostics);
    throw new AiRequestError(
      "The model response did not match the expected schema.",
      diagnostics
    );
  }

  return validated.data;
}

/** Provider and model actually in effect, for setup diagnostics. */
export function getActiveModelInfo(): {
  provider: AiProviderName;
  model: string;
} | null {
  const config = getConfig();
  if (!config) return null;

  return { provider: config.provider, model: config.model };
}

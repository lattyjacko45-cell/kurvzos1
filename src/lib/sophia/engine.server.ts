import { prisma } from "@/lib/prisma";
import {
  AiRequestError,
  generateStructured,
  getActiveModelInfo,
  getAiSetupState,
} from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { buildSophiaContext } from "@/lib/sophia/context.server";
import { buildSophiaFallback } from "@/lib/sophia/fallback";
import {
  SOPHIA_SYSTEM_PROMPT,
  buildSophiaUserPrompt,
} from "@/lib/sophia/prompt";
import {
  SOPHIA_JSON_SCHEMA,
  sophiaAnswerSchema,
  type SophiaResult,
} from "@/lib/sophia/types";

/** Server-only fallback record. No prompt text, no pipeline data, no keys. */
function logSophiaFallback(stage: string, detail?: string): void {
  const active = getActiveModelInfo();

  console.error("[sophia] falling back to deterministic marketing read", {
    stage,
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    detail: detail ?? null,
  });
}

export async function runSophia(
  profileId: string,
  workspaceId: string,
  question: string | null
): Promise<SophiaResult> {
  const context = await buildSophiaContext(profileId, workspaceId);
  const setup = getAiSetupState();

  let result: SophiaResult;

  if (!setup.configured) {
    logSophiaFallback("not-configured", setup.missing.join(", "));

    result = {
      advice: buildSophiaFallback(context, question),
      source: "FALLBACK",
      fallbackReason: "No AI provider is configured.",
    };
  } else {
    try {
      const raw = await generateStructured({
        systemPrompt: SOPHIA_SYSTEM_PROMPT,
        userPrompt: buildSophiaUserPrompt(context, question),
        maxTokens: 1200,
        // Enforced during decoding, so "no-json" cannot recur.
        jsonSchema: {
          name: "sophia_marketing_read",
          schema: SOPHIA_JSON_SCHEMA,
        },
        validator: sophiaAnswerSchema,
      });

      const parsed = sophiaAnswerSchema.safeParse(raw);

      if (parsed.success) {
        result = { advice: parsed.data, source: "AI" };
      } else {
        logSophiaFallback(
          "schema-validation",
          parsed.error.issues
            .map((issue) => issue.path.join(".") || "(root)")
            .join(", ")
        );

        result = {
          advice: buildSophiaFallback(context, question),
          source: "FALLBACK",
          fallbackReason: "The model response did not match Sophia's schema.",
        };
      }
    } catch (error) {
      logSophiaFallback(
        error instanceof AiRequestError
          ? (error.diagnostics?.stage ?? "provider-request")
          : "provider-request",
        error instanceof Error ? error.message : undefined
      );

      result = {
        advice: buildSophiaFallback(context, question),
        source: "FALLBACK",
        fallbackReason:
          error instanceof Error ? error.message : "The model request failed.",
      };
    }
  }

  // Language guard applies to both paths, before persisting.
  result = { ...result, advice: humanizeAdvice(result.advice) };

  await prisma.executiveConversation.create({
    data: {
      profileId,
      executive: "SOPHIA",
      userMessage: question,
      response: {
        ...result.advice,
        source: result.source,
        ...(result.fallbackReason
          ? { fallbackReason: result.fallbackReason }
          : {}),
      },
      contextSnapshot: JSON.parse(JSON.stringify(context)),
    },
  });

  return result;
}

export async function getLatestSophiaAdvice(profileId: string) {
  return prisma.executiveConversation.findFirst({
    where: { profileId, executive: "SOPHIA" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRecentSophiaConversations(
  profileId: string,
  take = 10
) {
  return prisma.executiveConversation.findMany({
    where: { profileId, executive: "SOPHIA" },
    orderBy: { createdAt: "desc" },
    take,
  });
}

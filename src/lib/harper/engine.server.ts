import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  AiRequestError,
  generateStructured,
  getActiveModelInfo,
  getAiSetupState,
} from "@/lib/ai/provider";
import { buildHarperContext } from "@/lib/harper/context.server";
import { buildFallbackAdvice } from "@/lib/harper/fallback";
import {
  HARPER_SYSTEM_PROMPT,
  buildHarperUserPrompt,
} from "@/lib/harper/prompt";
import {
  HARPER_JSON_SCHEMA,
  harperAnswerSchema,
  type HarperResult,
} from "@/lib/harper/types";

/**
 * Server-only record of why Harper fell back. Carries no prompt text, no
 * workspace data and no credentials — just the stage and provider identifiers.
 */
function logHarperFallback(stage: string, detail?: string): void {
  const active = getActiveModelInfo();

  console.error("[harper] falling back to deterministic advice", {
    stage,
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    detail: detail ?? null,
  });
}

/**
 * Runs Harper end to end: build context → ask the model → validate → persist.
 * Any failure downgrades to the deterministic path rather than surfacing an
 * error, so Harper always returns advice — but never silently.
 */
export async function runHarper(
  profileId: string,
  workspaceId: string,
  question: string | null
): Promise<HarperResult> {
  const context = await buildHarperContext(profileId, workspaceId);
  const setup = getAiSetupState();

  let result: HarperResult;

  if (!setup.configured) {
    logHarperFallback("not-configured", setup.missing.join(", "));

    result = {
      advice: buildFallbackAdvice(context, question),
      source: "FALLBACK",
      fallbackReason: "No AI provider is configured.",
    };
  } else {
    try {
      const raw = await generateStructured({
        systemPrompt: HARPER_SYSTEM_PROMPT,
        userPrompt: buildHarperUserPrompt(context, question),
        maxTokens: 900,
        jsonSchema: {
          name: "harper_advice",
          schema: HARPER_JSON_SCHEMA,
        },
        validator: harperAnswerSchema,
      });

      // Strict validation: an off-shape reply is treated as a failure, not
      // patched up, so malformed model output can never reach the UI.
      const parsed = harperAnswerSchema.safeParse(raw);

      if (parsed.success) {
        result = { advice: parsed.data, source: "AI" };
      } else {
        // Field paths only — never the offending values, which contain
        // workspace data.
        logHarperFallback(
          "schema-validation",
          parsed.error.issues
            .map((issue) => issue.path.join(".") || "(root)")
            .join(", ")
        );

        result = {
          advice: buildFallbackAdvice(context, question),
          source: "FALLBACK",
          fallbackReason: "The model response did not match Harper's schema.",
        };
      }
    } catch (error) {
      // Provider-level failures already logged their own diagnostics.
      logHarperFallback(
        error instanceof AiRequestError
          ? (error.diagnostics?.stage ?? "provider-request")
          : "provider-request",
        error instanceof Error ? error.message : undefined
      );

      result = {
        advice: buildFallbackAdvice(context, question),
        source: "FALLBACK",
        fallbackReason:
          error instanceof Error
            ? error.message
            : "The model request failed.",
      };
    }
  }

  await prisma.executiveConversation.create({
    data: {
      profileId,
      executive: "HARPER",
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

/**
 * Latest saved advice, used by the dashboard so rendering never triggers a
 * model call.
 */
export const getLatestHarperAdvice = cache(async function getLatestHarperAdvice(
  profileId: string
) {
  return prisma.executiveConversation.findFirst({
    where: { profileId, executive: "HARPER" },
    orderBy: { createdAt: "desc" },
  });
});

export async function getRecentHarperConversations(
  profileId: string,
  take = 10
) {
  return prisma.executiveConversation.findMany({
    where: { profileId, executive: "HARPER" },
    orderBy: { createdAt: "desc" },
    take,
  });
}

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  AiRequestError,
  generateStructured,
  getActiveModelInfo,
  getAiSetupState,
} from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { buildOliviaContext } from "@/lib/olivia/context.server";
import { buildOliviaFallback } from "@/lib/olivia/fallback";
import {
  OLIVIA_SYSTEM_PROMPT,
  buildOliviaUserPrompt,
} from "@/lib/olivia/prompt";
import {
  OLIVIA_JSON_SCHEMA,
  oliviaAnswerSchema,
  type OliviaResult,
} from "@/lib/olivia/types";

/** Server-only fallback record. No prompt text, no workspace data, no keys. */
function logOliviaFallback(stage: string, detail?: string): void {
  const active = getActiveModelInfo();

  console.error("[olivia] falling back to deterministic operations read", {
    stage,
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    detail: detail ?? null,
  });
}

export async function runOlivia(
  profileId: string,
  workspaceId: string,
  question: string | null
): Promise<OliviaResult> {
  const context = await buildOliviaContext(profileId, workspaceId);
  const setup = getAiSetupState();

  let result: OliviaResult;

  if (!setup.configured) {
    logOliviaFallback("not-configured", setup.missing.join(", "));

    result = {
      advice: buildOliviaFallback(context, question),
      source: "FALLBACK",
      fallbackReason: "No AI provider is configured.",
    };
  } else {
    try {
      const advice = await generateStructured({
        systemPrompt: OLIVIA_SYSTEM_PROMPT,
        userPrompt: buildOliviaUserPrompt(context, question),
        maxTokens: 1200,
        jsonSchema: {
          name: "olivia_operations_read",
          schema: OLIVIA_JSON_SCHEMA,
        },
        validator: oliviaAnswerSchema,
      });

      result = { advice, source: "AI" };
    } catch (error) {
      logOliviaFallback(
        error instanceof AiRequestError
          ? (error.diagnostics?.stage ?? "provider-request")
          : "provider-request",
        error instanceof Error ? error.message : undefined
      );

      result = {
        advice: buildOliviaFallback(context, question),
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
      executive: "OLIVIA",
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

export const getLatestOliviaAdvice = cache(async function getLatestOliviaAdvice(
  profileId: string
) {
  return prisma.executiveConversation.findFirst({
    where: { profileId, executive: "OLIVIA" },
    orderBy: { createdAt: "desc" },
  });
});

export async function getRecentOliviaConversations(
  profileId: string,
  take = 10
) {
  return prisma.executiveConversation.findMany({
    where: { profileId, executive: "OLIVIA" },
    orderBy: { createdAt: "desc" },
    take,
  });
}

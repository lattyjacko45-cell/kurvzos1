import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  AiRequestError,
  generateStructured,
  getActiveModelInfo,
  getAiSetupState,
} from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { buildMarcusContext } from "@/lib/marcus/context.server";
import { buildMarcusFallback } from "@/lib/marcus/fallback";
import {
  findFinancialSafetyViolations,
  groundAdviceLanguage,
} from "@/lib/marcus/safety";
import {
  MARCUS_SYSTEM_PROMPT,
  buildMarcusUserPrompt,
} from "@/lib/marcus/prompt";
import {
  MARCUS_JSON_SCHEMA,
  marcusAnswerSchema,
  type MarcusResult,
} from "@/lib/marcus/types";

/**
 * Server-only fallback record.
 *
 * Deliberately carries no financial values, no prompt text and no model
 * response — only the stage and provider identifiers.
 */
function logMarcusFallback(stage: string, detail?: string): void {
  const active = getActiveModelInfo();

  console.error("[marcus] falling back to deterministic financial read", {
    stage,
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    detail: detail ?? null,
  });
}

export async function runMarcus(
  profileId: string,
  workspaceId: string,
  question: string | null
): Promise<MarcusResult> {
  const context = await buildMarcusContext(profileId, workspaceId);
  const setup = getAiSetupState();

  let result: MarcusResult;

  if (!setup.configured) {
    logMarcusFallback("not-configured", setup.missing.join(", "));

    result = {
      advice: buildMarcusFallback(context, question),
      source: "FALLBACK",
      fallbackReason: "No AI provider is configured.",
    };
  } else {
    try {
      const advice = await generateStructured({
        systemPrompt: MARCUS_SYSTEM_PROMPT,
        userPrompt: buildMarcusUserPrompt(context, question),
        maxTokens: 1200,
        jsonSchema: {
          name: "marcus_financial_read",
          schema: MARCUS_JSON_SCHEMA,
        },
        validator: marcusAnswerSchema,
      });

      // Schema-valid is not the same as financially safe. A response that
      // treats the balance as spendable, names an unsupported amount, or
      // promises revenue is rejected outright rather than edited — a softened
      // version of unsafe advice is still unsafe advice.
      const violations = findFinancialSafetyViolations(advice, context);

      if (violations.length > 0) {
        logMarcusFallback("financial-safety", violations.join(", "));

        result = {
          advice: buildMarcusFallback(context, question),
          source: "FALLBACK",
          fallbackReason:
            "The model response did not meet Marcus's financial safety rules.",
        };
      } else {
        result = { advice, source: "AI" };
      }
    } catch (error) {
      logMarcusFallback(
        error instanceof AiRequestError
          ? (error.diagnostics?.stage ?? "provider-request")
          : "provider-request",
        error instanceof Error ? error.message : undefined
      );

      result = {
        advice: buildMarcusFallback(context, question),
        source: "FALLBACK",
        fallbackReason:
          error instanceof Error ? error.message : "The model request failed.",
      };
    }
  }

  // Language cleanup runs on both paths: field-name hygiene, then grounded
  // financial phrasing.
  result = {
    ...result,
    advice: groundAdviceLanguage(humanizeAdvice(result.advice)),
  };

  await prisma.executiveConversation.create({
    data: {
      profileId,
      executive: "MARCUS",
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

export const getLatestMarcusAdvice = cache(async function getLatestMarcusAdvice(
  profileId: string
) {
  return prisma.executiveConversation.findFirst({
    where: { profileId, executive: "MARCUS" },
    orderBy: { createdAt: "desc" },
  });
});

export async function getRecentMarcusConversations(
  profileId: string,
  take = 10
) {
  return prisma.executiveConversation.findMany({
    where: { profileId, executive: "MARCUS" },
    orderBy: { createdAt: "desc" },
    take,
  });
}

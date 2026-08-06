import { prisma } from "@/lib/prisma";
import {
  AiRequestError,
  generateStructured,
  getActiveModelInfo,
  getAiSetupState,
} from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { buildReneeContext } from "@/lib/renee/context.server";
import { buildReneeFallback } from "@/lib/renee/fallback";
import {
  RENEE_SYSTEM_PROMPT,
  buildReneeUserPrompt,
} from "@/lib/renee/prompt";
import { reneeAnswerSchema, type ReneeResult } from "@/lib/renee/types";

/** Server-only fallback record. No prompt text, no business data, no keys. */
function logReneeFallback(stage: string, detail?: string): void {
  const active = getActiveModelInfo();

  console.error("[renee] falling back to deterministic strategy", {
    stage,
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    detail: detail ?? null,
  });
}

export async function runRenee(
  profileId: string,
  workspaceId: string,
  question: string | null
): Promise<ReneeResult> {
  const context = await buildReneeContext(profileId, workspaceId);
  const setup = getAiSetupState();

  let result: ReneeResult;

  if (!setup.configured) {
    logReneeFallback("not-configured", setup.missing.join(", "));

    result = {
      advice: buildReneeFallback(context, question),
      source: "FALLBACK",
      fallbackReason: "No AI provider is configured.",
    };
  } else {
    try {
      const raw = await generateStructured({
        systemPrompt: RENEE_SYSTEM_PROMPT,
        userPrompt: buildReneeUserPrompt(context, question),
        maxTokens: 1200,
      });

      const parsed = reneeAnswerSchema.safeParse(raw);

      if (parsed.success) {
        result = { advice: parsed.data, source: "AI" };
      } else {
        logReneeFallback(
          "schema-validation",
          parsed.error.issues
            .map((issue) => issue.path.join(".") || "(root)")
            .join(", ")
        );

        result = {
          advice: buildReneeFallback(context, question),
          source: "FALLBACK",
          fallbackReason: "The model response did not match Renee's schema.",
        };
      }
    } catch (error) {
      logReneeFallback(
        error instanceof AiRequestError
          ? (error.diagnostics?.stage ?? "provider-request")
          : "provider-request",
        error instanceof Error ? error.message : undefined
      );

      result = {
        advice: buildReneeFallback(context, question),
        source: "FALLBACK",
        fallbackReason:
          error instanceof Error ? error.message : "The model request failed.",
      };
    }
  }

  // Belt and braces: the prompt forbids internal identifiers, this guarantees
  // it — and it applies to the deterministic path too. Done before persisting
  // so the stored row is already clean.
  result = { ...result, advice: humanizeAdvice(result.advice) };

  await prisma.executiveConversation.create({
    data: {
      profileId,
      executive: "RENEE",
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

export async function getLatestReneeAdvice(profileId: string) {
  return prisma.executiveConversation.findFirst({
    where: { profileId, executive: "RENEE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRecentReneeConversations(
  profileId: string,
  take = 10
) {
  return prisma.executiveConversation.findMany({
    where: { profileId, executive: "RENEE" },
    orderBy: { createdAt: "desc" },
    take,
  });
}

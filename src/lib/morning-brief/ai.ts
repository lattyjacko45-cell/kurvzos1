import {
  AiRequestError,
  generateStructured,
  getAiSetupState,
} from "@/lib/ai/provider";
import {
  HARPER_MORNING_BRIEF_CLASSIFICATION_SYSTEM_PROMPT,
  HARPER_MORNING_BRIEF_RECOMMENDATION_SYSTEM_PROMPT,
  buildMorningBriefClassificationUserPrompt,
  buildMorningBriefRecommendationUserPrompt,
  type PromptContext,
  type PromptEmail,
} from "@/lib/morning-brief/prompt";
import {
  MORNING_BRIEF_CLASSIFICATION_JSON_SCHEMA,
  MORNING_BRIEF_RECOMMENDATION_JSON_SCHEMA,
  morningBriefClassificationBatchSchema,
  morningBriefRecommendationSchema,
  type MorningBriefEmailClassification,
} from "@/lib/morning-brief/types";

/**
 * The AI-assisted pass for the Harper Morning Brief.
 *
 * One big structured request for a 15-20 email inbox was too slow: even at
 * low reasoning effort, a reasoning model (the gpt-5 family) generating a
 * category + action flag + reason for every email plus a closing
 * recommendation in one turn regularly ran past a 20s timeout, so AI
 * classification never completed and the page always fell back to
 * `classify.ts` — which is exactly why an obvious failed-payment email could
 * still land in Can Wait even with an AI provider configured. Batching that
 * many emails into one request was the bottleneck, not the model or the
 * timeout mechanism itself.
 *
 * The fix is to stop asking for one big answer:
 *  - Classification is split into small batches (`BATCH_SIZE` emails each)
 *    and run in parallel — each batch is a fast, independent request with
 *    its own short timeout, so total wall time is roughly the slowest
 *    single batch, not the sum of all of them.
 *  - Each batch also falls back independently: a batch that fails or times
 *    out returns `null` for just its own emails, so a single unlucky batch
 *    degrades that handful of emails to `classify.ts` while every other
 *    batch's AI classifications are still used. The old all-or-nothing
 *    behaviour (any failure discards the whole inbox's AI pass) is gone.
 *  - The closing recommendation is now its own call — a few sentences, not
 *    an array — running in parallel with the classification batches rather
 *    than bundled into the same request. It falls back to the deterministic
 *    recommendation on its own, independent of how classification went.
 *
 * Never sends a Gmail message id, address or link — only what `prompt.ts`
 * already strips down to.
 */

/** Emails per classification request. Small enough that even a slow
 *  response finishes well inside its timeout; large enough that a
 *  typical inbox (up to Gmail's MAX_ALLOWED_RESULTS of 20) needs only a
 *  handful of parallel batches, not one per email. */
const BATCH_SIZE = 5;

/** Generous for five short classifications, still a fraction of the old
 *  20s ceiling — a hung batch now degrades in seconds, not tens of
 *  seconds, and other batches are unaffected either way. */
const CLASSIFICATION_TIMEOUT_MS = 12_000;

/** The recommendation is a single short sentence; it needs less time than
 *  a classification batch even though its prompt carries more context. */
const RECOMMENDATION_TIMEOUT_MS = 10_000;

export interface MorningBriefAiClassification {
  /** One slot per input email, in the same order as `context.emails`.
   *  `null` means that specific email's AI classification is unavailable
   *  (its batch failed, timed out, or didn't validate) — the caller falls
   *  back to `classify.ts` for that email alone, never for the whole
   *  inbox. */
  emails: Array<MorningBriefEmailClassification | null>;
  /** `null` when the recommendation call failed, timed out, or didn't
   *  validate — the caller falls back to the deterministic recommendation. */
  recommendation: string | null;
}

function logMorningBriefFallback(stage: string, detail?: string): void {
  console.error("[morning-brief] falling back to deterministic classification", {
    stage,
    detail: detail ?? null,
  });
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Classifies one batch of emails. Never throws — any failure (request
 * error, timeout, schema mismatch, a count that doesn't match the batch)
 * degrades to an all-`null` array the same length as the batch, so the
 * caller can fall back per email without knowing why this batch failed.
 */
async function classifyBatch(
  emails: PromptEmail[]
): Promise<Array<MorningBriefEmailClassification | null>> {
  try {
    const raw = await generateStructured({
      systemPrompt: HARPER_MORNING_BRIEF_CLASSIFICATION_SYSTEM_PROMPT,
      userPrompt: buildMorningBriefClassificationUserPrompt(emails),
      reasoningEffort: "low",
      timeoutMs: CLASSIFICATION_TIMEOUT_MS,
      jsonSchema: {
        name: "harper_morning_brief_classification",
        schema: MORNING_BRIEF_CLASSIFICATION_JSON_SCHEMA,
      },
      validator: morningBriefClassificationBatchSchema,
    });

    const parsed = morningBriefClassificationBatchSchema.safeParse(raw);

    if (!parsed.success) {
      logMorningBriefFallback(
        "schema-validation",
        parsed.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ")
      );
      return emails.map(() => null);
    }

    if (parsed.data.emails.length !== emails.length) {
      // Positional correlation only works when the counts match exactly. A
      // mismatch is treated as a failure rather than guessed at.
      logMorningBriefFallback("email-count-mismatch");
      return emails.map(() => null);
    }

    return parsed.data.emails;
  } catch (error) {
    logMorningBriefFallback(
      error instanceof AiRequestError
        ? (error.diagnostics?.stage ?? "provider-request")
        : "provider-request",
      error instanceof Error ? error.message : undefined
    );
    return emails.map(() => null);
  }
}

/**
 * Writes the closing recommendation on its own. Never throws — any failure
 * returns `null`, and the caller falls back to the deterministic
 * recommendation.
 */
async function classifyRecommendation(
  context: PromptContext
): Promise<string | null> {
  try {
    const raw = await generateStructured({
      systemPrompt: HARPER_MORNING_BRIEF_RECOMMENDATION_SYSTEM_PROMPT,
      userPrompt: buildMorningBriefRecommendationUserPrompt(context),
      reasoningEffort: "low",
      timeoutMs: RECOMMENDATION_TIMEOUT_MS,
      jsonSchema: {
        name: "harper_morning_brief_recommendation",
        schema: MORNING_BRIEF_RECOMMENDATION_JSON_SCHEMA,
      },
      validator: morningBriefRecommendationSchema,
    });

    const parsed = morningBriefRecommendationSchema.safeParse(raw);

    if (!parsed.success) {
      logMorningBriefFallback(
        "schema-validation",
        parsed.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ")
      );
      return null;
    }

    return parsed.data.recommendation;
  } catch (error) {
    logMorningBriefFallback(
      error instanceof AiRequestError
        ? (error.diagnostics?.stage ?? "provider-request")
        : "provider-request",
      error instanceof Error ? error.message : undefined
    );
    return null;
  }
}

export async function classifyMorningBriefWithAi(
  context: PromptContext
): Promise<MorningBriefAiClassification | null> {
  const setup = getAiSetupState();

  if (!setup.configured) {
    return null;
  }

  if (context.emails.length === 0) {
    // Nothing to classify; still worth a recommendation, but not worth a
    // model call when the deterministic path can say "clear inbox" for free.
    return null;
  }

  const batches = chunk(context.emails, BATCH_SIZE);

  // All in parallel: every classification batch and the recommendation call
  // run concurrently, each with its own timeout. classifyBatch and
  // classifyRecommendation never throw, so this never rejects — wall time is
  // bounded by the slowest single call, not the sum of all of them.
  const [batchResults, recommendation] = await Promise.all([
    Promise.all(batches.map((batch) => classifyBatch(batch))),
    classifyRecommendation(context),
  ]);

  return {
    emails: batchResults.flat(),
    recommendation,
  };
}

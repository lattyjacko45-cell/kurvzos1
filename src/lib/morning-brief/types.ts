import { z } from "zod";

/**
 * The AI path's contract for the Harper Morning Brief.
 *
 * Mirrors `harper/types.ts`: Zod schemas for validating the model's JSON
 * replies, plus matching provider-enforced JSON schemas. The classification
 * *rules* that matter for correctness live in `classify.ts`, which is fully
 * tested and is exactly what runs when the AI path is unavailable or its
 * output fails validation.
 *
 * Correlation is positional, not by id: the model receives an anonymous,
 * ordered list of emails and must return classifications in the same order,
 * one per input. No Gmail message id, address or link is ever sent to or
 * received from the model — the same boundary `workspace-context` already
 * enforces for Harper's own context.
 */

export const MORNING_BRIEF_CATEGORIES = [
  "MONEY_AND_ACCOUNTS",
  "KURVZ_PROFORMANCE",
  "CAREER_AND_OPPORTUNITIES",
  "CAN_WAIT",
  "POTENTIAL_JUNK",
  "UNSUBSCRIBE_CANDIDATE",
] as const;

export const morningBriefEmailClassificationSchema = z.object({
  category: z.enum(MORNING_BRIEF_CATEGORIES),
  isActionToday: z.boolean(),
  reason: z.string().trim().min(1).max(160),
});

export type MorningBriefEmailClassification = z.infer<
  typeof morningBriefEmailClassificationSchema
>;

/** Provider-enforced shape of one classified email. Mirrors the Zod schema above. */
const MORNING_BRIEF_EMAIL_ITEM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: MORNING_BRIEF_CATEGORIES as unknown as string[] },
    isActionToday: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["category", "isActionToday", "reason"],
} as const satisfies Record<string, unknown>;

/**
 * Classification and recommendation are two independent AI calls (see
 * `ai.ts`), not one combined response — a single request classifying 15-20
 * emails plus writing a recommendation took long enough on a reasoning model
 * to blow past any practical page-load timeout. Splitting the contract in
 * two lets classification run as several small, parallel, independently-
 * timed-out batches, while the recommendation — a single short sentence —
 * runs on its own.
 */

/** One classification batch's request/response contract. A batch is a
 *  handful of emails (see `BATCH_SIZE` in `ai.ts`), not the whole inbox. */
export const morningBriefClassificationBatchSchema = z.object({
  emails: z.array(morningBriefEmailClassificationSchema),
});

export type MorningBriefClassificationBatch = z.infer<
  typeof morningBriefClassificationBatchSchema
>;

/** Provider-enforced shape. Mirrors the Zod schema above. */
export const MORNING_BRIEF_CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    emails: {
      type: "array",
      items: MORNING_BRIEF_EMAIL_ITEM_JSON_SCHEMA,
    },
  },
  required: ["emails"],
} as const satisfies Record<string, unknown>;

/** The closing recommendation's request/response contract, on its own. */
export const morningBriefRecommendationSchema = z.object({
  /** Two to three sentences — enforced loosely here by length; the prompt
   *  carries the actual instruction. */
  recommendation: z.string().trim().min(1).max(500),
});

export type MorningBriefRecommendation = z.infer<
  typeof morningBriefRecommendationSchema
>;

/** Provider-enforced shape. Mirrors the Zod schema above. */
export const MORNING_BRIEF_RECOMMENDATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendation: { type: "string" },
  },
  required: ["recommendation"],
} as const satisfies Record<string, unknown>;

import { z } from "zod";

/**
 * Sophia's contract — Chief Marketing Officer.
 *
 * Harper answers "what should I do next?", Renee answers "are we working on
 * the right thing?". Sophia answers a third question: "what should we publish,
 * promote, or improve to grow?" — so she reasons over the content pipeline
 * rather than the task list or the project portfolio.
 */

export const sophiaAdviceSchema = z.object({
  /** One marketing outcome that deserves attention. */
  marketingPriority: z.string().trim().min(1).max(200),
  /** Exactly one content action. */
  contentRecommendation: z.string().trim().min(1).max(400),
  /** One primary channel or content format. */
  channelFocus: z.string().trim().min(1).max(200),
  /** One item worth promoting or repurposing. Null when there is none. */
  promotionOpportunity: z.string().trim().max(300).nullish(),
  /** One gap or consistency risk. Null when none exists. */
  marketingRisk: z.string().trim().max(300).nullish(),
  whyThisMatters: z.string().trim().min(1).max(400),
});

export type SophiaAdvice = z.infer<typeof sophiaAdviceSchema>;

export const sophiaAnswerSchema = sophiaAdviceSchema.extend({
  answer: z.string().trim().min(1).max(1200).nullish(),
});

export type SophiaAnswer = z.infer<typeof sophiaAnswerSchema>;

/**
 * Provider-enforced shape for Sophia's reply.
 *
 * Mirrors `sophiaAnswerSchema`. OpenAI strict mode requires every property in
 * `required` and `additionalProperties: false`, so the three optional fields
 * are declared nullable rather than omitted.
 */
export const SOPHIA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    marketingPriority: { type: "string" },
    contentRecommendation: { type: "string" },
    channelFocus: { type: "string" },
    promotionOpportunity: { type: ["string", "null"] },
    marketingRisk: { type: ["string", "null"] },
    whyThisMatters: { type: "string" },
    answer: { type: ["string", "null"] },
  },
  required: [
    "marketingPriority",
    "contentRecommendation",
    "channelFocus",
    "promotionOpportunity",
    "marketingRisk",
    "whyThisMatters",
    "answer",
  ],
} as const satisfies Record<string, unknown>;

export type SophiaSource = "AI" | "FALLBACK";

export interface SophiaResult {
  advice: SophiaAnswer;
  source: SophiaSource;
  fallbackReason?: string;
}

/**
 * Exactly what Sophia is allowed to see. Pipeline-shaped.
 *
 * Excluded by construction: ids, emails, API keys, OAuth tokens, YouTube
 * connection records, video ids and watch URLs. Content appears as titles,
 * formats, plain-language statuses and dates only.
 */
export interface SophiaContext {
  generatedAt: string;
  contentPipeline: Array<{
    title: string;
    format: string;
    stage: string;
    scheduledFor: string | null;
    publishedOn: string | null;
    linkedTask: string | null;
  }>;
  pipelineCounts: {
    drafts: number;
    readyOrUploading: number;
    scheduled: number;
    published: number;
    failed: number;
  };
  publishingCadence: {
    publishedLast30Days: number;
    daysSinceLastPublish: number | null;
    scheduledAhead: number;
  };
  formats: {
    longForm: number;
    shorts: number;
  };
  contentProjects: Array<{
    name: string;
    description: string | null;
    contentItems: number;
    openTasks: number;
    completedThisWeek: number;
  }>;
  contentWork: {
    openContentTasks: number;
    overdueContentTasks: number;
    recentCompletedContentTasks: string[];
  };
  mission: {
    title: string;
    projectName: string;
    isContentWork: boolean;
  } | null;
  weeklyPacket: {
    weeklyPriority: string | null;
    risks: string[];
  };
  focus: {
    minutesLast7Days: number;
    sessionsLast7Days: number;
  };
  latestHarperNextMove: string | null;
  latestReneeStrategicPriority: string | null;
  marketingFeedback: Array<{ type: string; description: string }>;
}

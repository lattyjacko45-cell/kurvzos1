import { z } from "zod";

/**
 * Olivia's contract — Chief Operations Officer.
 *
 * The other three executives ask what to do, whether it is the right thing,
 * and what to publish. Olivia asks a fourth question: what is slowing
 * execution down, and how should the process change? She reasons over the
 * *shape* of the work — age, staleness, handoffs, repetition — rather than its
 * content.
 */

export const oliviaAdviceSchema = z.object({
  /** One operational outcome that needs attention. */
  operationsPriority: z.string().trim().min(1).max(200),
  /** One process blockage or source of friction. */
  currentBottleneck: z.string().trim().min(1).max(400),
  /** Exactly one practical change. */
  processRecommendation: z.string().trim().min(1).max(400),
  /** Something repeatable worth documenting, delegating or automating. */
  systemOrDelegationOpportunity: z.string().trim().max(300).nullish(),
  /** One execution risk. Null when none exists. */
  operationsRisk: z.string().trim().max(300).nullish(),
  whyThisMatters: z.string().trim().min(1).max(400),
});

export type OliviaAdvice = z.infer<typeof oliviaAdviceSchema>;

export const oliviaAnswerSchema = oliviaAdviceSchema.extend({
  answer: z.string().trim().min(1).max(1200).nullish(),
});

export type OliviaAnswer = z.infer<typeof oliviaAnswerSchema>;

/** Provider-enforced shape. Mirrors oliviaAnswerSchema. */
export const OLIVIA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    operationsPriority: { type: "string" },
    currentBottleneck: { type: "string" },
    processRecommendation: { type: "string" },
    systemOrDelegationOpportunity: { type: ["string", "null"] },
    operationsRisk: { type: ["string", "null"] },
    whyThisMatters: { type: "string" },
    answer: { type: ["string", "null"] },
  },
  required: [
    "operationsPriority",
    "currentBottleneck",
    "processRecommendation",
    "systemOrDelegationOpportunity",
    "operationsRisk",
    "whyThisMatters",
    "answer",
  ],
} as const satisfies Record<string, unknown>;

export type OliviaSource = "AI" | "FALLBACK";

export interface OliviaResult {
  advice: OliviaAnswer;
  source: OliviaSource;
  fallbackReason?: string;
}

/**
 * Exactly what Olivia is allowed to see. Process-shaped.
 *
 * Excluded by construction: record ids, emails, API keys, OAuth tokens and
 * YouTube secrets. Statuses are translated to plain language at the source.
 */
export interface OliviaContext {
  generatedAt: string;
  workload: {
    openTasks: number;
    overdueTasks: number;
    completedThisWeek: number;
    dueToday: number;
  };
  /** Open work grouped by the stage it is sitting in. */
  tasksByStage: Array<{ stage: string; count: number }>;
  /** Untouched for a week or more — the clearest staleness signal we hold. */
  stalledTasks: Array<{
    title: string;
    projectName: string;
    stage: string;
    daysSinceUpdate: number;
  }>;
  /** Checklist finished but the task never closed: a missed handoff. */
  finishedButOpenTasks: Array<{ title: string; projectName: string }>;
  /** No checklist at all: work with no defined process. */
  tasksWithoutChecklist: Array<{ title: string; projectName: string }>;
  overdueTasks: Array<{
    title: string;
    projectName: string;
    daysOverdue: number;
  }>;
  checklistProgress: {
    tasksWithChecklist: number;
    tasksWithoutChecklist: number;
    averagePercentComplete: number;
  };
  projects: Array<{
    name: string;
    status: string;
    openTasks: number;
    completedThisWeek: number;
    hasActionableWork: boolean;
    daysSinceActivity: number;
  }>;
  mission: {
    title: string;
    projectName: string;
    stage: string;
    isOverdue: boolean;
  } | null;
  focus: {
    sessionsLast7Days: number;
    minutesLast7Days: number;
    averageSessionMinutes: number | null;
    /** Focus minutes per task completed this week, when both are known. */
    averageMinutesPerCompletedTask: number | null;
  };
  contentPipeline: Array<{ stage: string; count: number }>;
  feedback: {
    unresolved: number;
    recent: Array<{ type: string; description: string }>;
  };
  weeklyPacket: {
    risks: string[];
    nextMove: string;
  };
  latestHarperNextMove: string | null;
  latestReneeStrategicPriority: string | null;
  latestSophiaMarketingPriority: string | null;
}

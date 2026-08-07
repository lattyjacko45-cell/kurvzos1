import { z } from "zod";

/**
 * Harper's contract. Both the AI path and the deterministic fallback produce
 * exactly this shape, so the UI never has to know which one ran.
 */

export const harperAdviceSchema = z.object({
  /** The single task that matters most. */
  currentPriority: z.string().trim().min(1).max(200),
  /** Exactly one concrete action. */
  nextMove: z.string().trim().min(1).max(300),
  whyThisMatters: z.string().trim().min(1).max(400),
  /** Omitted when there is no real risk to flag. */
  watchOutFor: z.string().trim().max(300).nullish(),
});

export type HarperAdvice = z.infer<typeof harperAdviceSchema>;

export const harperAnswerSchema = harperAdviceSchema.extend({
  /** Direct reply to the user's question, when they asked one. */
  answer: z.string().trim().min(1).max(1200).nullish(),
});

export type HarperAnswer = z.infer<typeof harperAnswerSchema>;

/** Provider-enforced shape for Harper's reply. Mirrors harperAnswerSchema. */
export const HARPER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    currentPriority: { type: "string" },
    nextMove: { type: "string" },
    whyThisMatters: { type: "string" },
    watchOutFor: { type: ["string", "null"] },
    answer: { type: ["string", "null"] },
  },
  required: [
    "currentPriority",
    "nextMove",
    "whyThisMatters",
    "watchOutFor",
    "answer",
  ],
} as const satisfies Record<string, unknown>;

export type HarperSource = "AI" | "FALLBACK";

export interface HarperResult {
  advice: HarperAnswer;
  source: HarperSource;
  /** Set when the AI path was attempted and failed. */
  fallbackReason?: string;
}

/**
 * The exact data Harper is allowed to see. Everything here is derived from the
 * authenticated profile's own workspace — no ids, emails, tokens or settings.
 */
export interface HarperContext {
  generatedAt: string;
  mission: {
    title: string;
    projectName: string;
    status: string;
    priority: string;
    isOverdue: boolean;
    dueDate: string | null;
  } | null;
  checklist: {
    currentStep: string | null;
    nextStep: string | null;
    completedSteps: number;
    totalSteps: number;
    percent: number;
  };
  counts: {
    overdue: number;
    dueToday: number;
    openTasks: number;
    completedThisWeek: number;
    activeProjects: number;
  };
  activeProjects: string[];
  recentCompletedTasks: string[];
  focus: {
    minutesLast7Days: number;
    sessionsLast7Days: number;
  };
  weeklyPacket: {
    weeklyPriority: string | null;
    risks: string[];
    nextMove: string;
  };
  unresolvedFeedback: Array<{ type: string; description: string }>;
  /**
   * Lightweight schedule awareness so Harper can answer "what can I
   * realistically start now?". Null when no calendar is connected.
   *
   * Titles only — no attendees, organisers, locations, links or event ids.
   * This never overrides the mission selector; it only informs the framing.
   */
  schedule: {
    currentEvent: string | null;
    nextEvent: string | null;
    minutesUntilNextEvent: number | null;
    eventsRemainingToday: number;
    largestFreeGapMinutes: number | null;
  } | null;
}

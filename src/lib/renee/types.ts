import { z } from "zod";

/**
 * Renee's contract — Chief Business Strategist.
 *
 * Harper answers "what should I do next?". Renee answers "are we working on
 * the right thing?", so her output is a different shape entirely: one business
 * outcome, an alignment verdict, one recommendation, and one thing to drop.
 */

export const reneeAdviceSchema = z.object({
  /** The one business outcome that deserves the most attention. */
  strategicPriority: z.string().trim().min(1).max(200),
  /** Whether current work supports that priority. */
  alignmentCheck: z.string().trim().min(1).max(400),
  /** Exactly one recommendation. */
  strategicRecommendation: z.string().trim().min(1).max(400),
  /** One task, project or category to pause. Null when nothing should stop. */
  whatToDeprioritize: z.string().trim().max(300).nullish(),
  whyThisMatters: z.string().trim().min(1).max(400),
});

export type ReneeAdvice = z.infer<typeof reneeAdviceSchema>;

export const reneeAnswerSchema = reneeAdviceSchema.extend({
  answer: z.string().trim().min(1).max(1200).nullish(),
});

export type ReneeAnswer = z.infer<typeof reneeAnswerSchema>;

export type ReneeSource = "AI" | "FALLBACK";

export interface ReneeResult {
  advice: ReneeAnswer;
  source: ReneeSource;
  fallbackReason?: string;
}

/**
 * Exactly what Renee is allowed to see. Business-shaped rather than
 * task-shaped: projects and their descriptions carry the strategy signal.
 *
 * Excluded by construction: ids, emails, API keys, OAuth tokens, YouTube
 * credentials, and anything from another profile.
 */
export interface ReneeContext {
  generatedAt: string;
  projects: Array<{
    name: string;
    description: string | null;
    status: string;
    openTasks: number;
    completedThisWeek: number;
  }>;
  mission: {
    title: string;
    projectName: string;
    status: string;
    isOverdue: boolean;
  } | null;
  workload: {
    openTasks: number;
    completedThisWeek: number;
    overdue: number;
    dueToday: number;
  };
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
  content: Array<{
    title: string;
    contentType: string;
    status: string;
    scheduledFor: string | null;
  }>;
  /** So Renee can comment on execution advice without recomputing it. */
  latestHarperNextMove: string | null;
  unresolvedFeedback: Array<{ type: string; description: string }>;
}

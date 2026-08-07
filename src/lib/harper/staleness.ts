import { z } from "zod";

import type { HarperContext } from "@/lib/harper/types";

/**
 * Staleness and significance rules for Harper.
 *
 * Two different questions, deliberately kept apart:
 *
 *  - *Stale* — does the saved advice still describe reality? If not, the UI
 *    must immediately fall back to a fresh deterministic recommendation. Cheap,
 *    checked on every render.
 *  - *Significant* — is the change big enough to justify spending a model call?
 *    Advancing one checklist step is not; finishing a task is.
 *
 * Everything here is pure so both the server view and the auto-refresh route
 * apply identical rules.
 */

const missionSchema = z
  .object({
    title: z.string(),
    projectName: z.string(),
    status: z.string(),
    priority: z.string(),
    isOverdue: z.boolean(),
    dueDate: z.string().nullable(),
  })
  .nullable();

/** Loose on purpose: an older snapshot shape must not throw, just miss. */
export const harperContextSchema = z.object({
  generatedAt: z.string(),
  mission: missionSchema,
  checklist: z.object({
    currentStep: z.string().nullable(),
    nextStep: z.string().nullable(),
    completedSteps: z.number(),
    totalSteps: z.number(),
    percent: z.number(),
  }),
  counts: z.object({
    overdue: z.number(),
    dueToday: z.number(),
    openTasks: z.number(),
    completedThisWeek: z.number(),
    activeProjects: z.number(),
  }),
  activeProjects: z.array(z.string()),
  recentCompletedTasks: z.array(z.string()),
  focus: z.object({
    minutesLast7Days: z.number(),
    sessionsLast7Days: z.number(),
  }),
  weeklyPacket: z.object({
    weeklyPriority: z.string().nullable(),
    risks: z.array(z.string()),
    nextMove: z.string(),
  }),
  unresolvedFeedback: z.array(
    z.object({ type: z.string(), description: z.string() })
  ),
  // Optional so snapshots written before Calendar existed still parse.
  schedule: z
    .object({
      currentEvent: z.string().nullable(),
      nextEvent: z.string().nullable(),
      minutesUntilNextEvent: z.number().nullable(),
      eventsRemainingToday: z.number(),
      largestFreeGapMinutes: z.number().nullable(),
    })
    .nullable()
    .optional(),
});

export function parseStoredContext(value: unknown): HarperContext | null {
  const parsed = harperContextSchema.safeParse(value);
  return parsed.success ? (parsed.data as HarperContext) : null;
}

/**
 * The parts of the context that make advice right or wrong. `generatedAt`,
 * focus minutes and feedback are excluded — they move constantly without
 * changing what the user should do next.
 */
export function contextFingerprint(context: HarperContext): string {
  return [
    context.mission?.title ?? "none",
    context.mission?.status ?? "none",
    context.mission?.isOverdue ? "overdue" : "ontime",
    context.checklist.currentStep ?? "none",
    context.checklist.completedSteps,
    context.checklist.totalSteps,
    context.counts.overdue,
    context.counts.dueToday,
    context.counts.openTasks,
    context.counts.completedThisWeek,
    // Schedule facts that change what is realistically startable. Minutes
    // until the next event are excluded: they tick down constantly.
    context.schedule?.currentEvent ?? "none",
    context.schedule?.nextEvent ?? "none",
    context.schedule?.eventsRemainingToday ?? 0,
  ].join("|");
}

export function isContextStale(
  saved: HarperContext | null,
  current: HarperContext
): boolean {
  if (!saved) return true;
  return contextFingerprint(saved) !== contextFingerprint(current);
}

/** True when every step of a non-empty checklist is done. */
function checklistJustCompleted(context: HarperContext): boolean {
  return (
    context.checklist.totalSteps > 0 &&
    context.checklist.completedSteps === context.checklist.totalSteps
  );
}

/**
 * Worth a model call. Ordinary step-to-step progress deliberately returns
 * false — that path is served by the deterministic engine.
 */
export function isSignificantChange(
  saved: HarperContext | null,
  current: HarperContext
): boolean {
  // Nothing saved yet: the first run is always worth it.
  if (!saved) return true;

  // The primary mission changed, appeared, or disappeared.
  const savedMission = saved.mission?.title ?? null;
  const currentMission = current.mission?.title ?? null;
  if (savedMission !== currentMission) return true;

  // Status moved (TODO → IN_PROGRESS → REVIEW, or a task was completed).
  if ((saved.mission?.status ?? null) !== (current.mission?.status ?? null)) {
    return true;
  }

  // A task finished or was reopened.
  if (saved.counts.completedThisWeek !== current.counts.completedThisWeek) {
    return true;
  }
  if (saved.counts.openTasks !== current.counts.openTasks) return true;

  // The checklist just crossed the finish line.
  if (!checklistJustCompleted(saved) && checklistJustCompleted(current)) {
    return true;
  }

  // Overdue pressure changed.
  if (saved.counts.overdue !== current.counts.overdue) return true;

  return false;
}

import { z } from "zod";

import type { OliviaContext } from "@/lib/olivia/types";

/**
 * Staleness and significance for Olivia.
 *
 * Operational advice goes wrong when the *shape* of the work changes — a task
 * moves stage or ages past a threshold, a project empties, a focus session
 * lands, feedback arrives. Ticking a single checklist step does not change the
 * diagnosis, and a running timer certainly does not.
 */

export const oliviaContextSchema = z.object({
  generatedAt: z.string(),
  workload: z.object({
    openTasks: z.number(),
    overdueTasks: z.number(),
    completedThisWeek: z.number(),
    dueToday: z.number(),
  }),
  tasksByStage: z.array(z.object({ stage: z.string(), count: z.number() })),
  stalledTasks: z.array(
    z.object({
      title: z.string(),
      projectName: z.string(),
      stage: z.string(),
      daysSinceUpdate: z.number(),
    })
  ),
  finishedButOpenTasks: z.array(
    z.object({ title: z.string(), projectName: z.string() })
  ),
  tasksWithoutChecklist: z.array(
    z.object({ title: z.string(), projectName: z.string() })
  ),
  overdueTasks: z.array(
    z.object({
      title: z.string(),
      projectName: z.string(),
      daysOverdue: z.number(),
    })
  ),
  checklistProgress: z.object({
    tasksWithChecklist: z.number(),
    tasksWithoutChecklist: z.number(),
    averagePercentComplete: z.number(),
  }),
  projects: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      openTasks: z.number(),
      completedThisWeek: z.number(),
      hasActionableWork: z.boolean(),
      daysSinceActivity: z.number(),
    })
  ),
  mission: z
    .object({
      title: z.string(),
      projectName: z.string(),
      stage: z.string(),
      isOverdue: z.boolean(),
    })
    .nullable(),
  focus: z.object({
    sessionsLast7Days: z.number(),
    minutesLast7Days: z.number(),
    averageSessionMinutes: z.number().nullable(),
    averageMinutesPerCompletedTask: z.number().nullable(),
  }),
  contentPipeline: z.array(
    z.object({ stage: z.string(), count: z.number() })
  ),
  feedback: z.object({
    unresolved: z.number(),
    recent: z.array(
      z.object({ type: z.string(), description: z.string() })
    ),
  }),
  weeklyPacket: z.object({
    risks: z.array(z.string()),
    nextMove: z.string(),
  }),
  latestHarperNextMove: z.string().nullable(),
  latestReneeStrategicPriority: z.string().nullable(),
  latestSophiaMarketingPriority: z.string().nullable(),
  // Optional so snapshots written before Calendar existed still parse.
  schedule: z
    .object({
      eventsToday: z.number(),
      allDayEventsToday: z.number(),
      bookedMinutesToday: z.number(),
      largestFreeGapMinutes: z.number().nullable(),
      freeMinutesRemainingToday: z.number(),
    })
    .nullable()
    .optional(),
});

export function parseStoredOliviaContext(
  value: unknown
): OliviaContext | null {
  const parsed = oliviaContextSchema.safeParse(value);
  return parsed.success ? (parsed.data as OliviaContext) : null;
}

function titles(items: Array<{ title: string }>): string {
  return items
    .map((item) => item.title)
    .sort()
    .join(",");
}

function stageSignature(
  stages: Array<{ stage: string; count: number }>
): string {
  return stages
    .map((entry) => `${entry.stage}:${entry.count}`)
    .sort()
    .join(",");
}

/**
 * Fields that make an operational diagnosis right or wrong. The three
 * bottleneck sets are included by identity, not just by count, so swapping one
 * stalled task for another still counts as a change.
 */
export function oliviaFingerprint(context: OliviaContext): string {
  return [
    stageSignature(context.tasksByStage),
    context.workload.openTasks,
    context.workload.overdueTasks,
    context.workload.completedThisWeek,
    titles(context.finishedButOpenTasks),
    titles(context.stalledTasks),
    titles(context.tasksWithoutChecklist),
    titles(context.overdueTasks),
    context.projects
      .map(
        (project) =>
          `${project.name}:${project.status}:${project.hasActionableWork ? 1 : 0}`
      )
      .sort()
      .join(","),
    context.mission?.title ?? "none",
    context.mission?.stage ?? "none",
    context.focus.sessionsLast7Days,
    context.feedback.unresolved,
    stageSignature(context.contentPipeline),
    // Commitment load changes the diagnosis. Free-minutes-remaining is
    // excluded: it decreases every minute without changing anything.
    context.schedule?.eventsToday ?? 0,
    context.schedule?.bookedMinutesToday ?? 0,
  ].join("|");
}

export function isOliviaContextStale(
  saved: OliviaContext | null,
  current: OliviaContext
): boolean {
  if (!saved) return true;
  return oliviaFingerprint(saved) !== oliviaFingerprint(current);
}

/**
 * Worth a model call. Note what is absent: checklist percentage, focus
 * minutes, and average durations all move without changing the diagnosis.
 */
export function isOliviaSignificantChange(
  saved: OliviaContext | null,
  current: OliviaContext
): boolean {
  if (!saved) return true;

  // Work moved between stages, or the open/overdue/completed balance shifted.
  if (
    stageSignature(saved.tasksByStage) !== stageSignature(current.tasksByStage)
  ) {
    return true;
  }
  if (saved.workload.overdueTasks !== current.workload.overdueTasks) {
    return true;
  }
  if (saved.workload.completedThisWeek !== current.workload.completedThisWeek) {
    return true;
  }

  // A bottleneck set changed membership — this is the diagnosis itself.
  if (titles(saved.finishedButOpenTasks) !== titles(current.finishedButOpenTasks)) {
    return true;
  }
  if (titles(saved.stalledTasks) !== titles(current.stalledTasks)) return true;
  if (
    titles(saved.tasksWithoutChecklist) !==
    titles(current.tasksWithoutChecklist)
  ) {
    return true;
  }

  // A project became idle or was reactivated.
  const projectShape = (context: OliviaContext) =>
    context.projects
      .map(
        (project) =>
          `${project.name}:${project.status}:${project.hasActionableWork ? 1 : 0}`
      )
      .sort()
      .join(",");
  if (projectShape(saved) !== projectShape(current)) return true;

  // A focus session ended, or feedback was submitted or resolved.
  if (saved.focus.sessionsLast7Days !== current.focus.sessionsLast7Days) {
    return true;
  }
  if (saved.feedback.unresolved !== current.feedback.unresolved) return true;

  // Content moved between major workflow stages.
  if (
    stageSignature(saved.contentPipeline) !==
    stageSignature(current.contentPipeline)
  ) {
    return true;
  }

  // The day's commitment load changed — an added or cancelled meeting can
  // genuinely change whether there is execution space left.
  if ((saved.schedule?.eventsToday ?? 0) !== (current.schedule?.eventsToday ?? 0)) {
    return true;
  }

  return false;
}

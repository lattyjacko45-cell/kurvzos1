import { z } from "zod";

import type { ReneeContext } from "@/lib/renee/types";

/**
 * Staleness and significance for Renee.
 *
 * Same two-question split as Harper, but tuned to strategy rather than
 * execution. Strategy does not change because a checklist step was ticked; it
 * changes when the portfolio moves — a project opens or closes, the weekly
 * priority shifts, content ships.
 */

export const reneeContextSchema = z.object({
  generatedAt: z.string(),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      openTasks: z.number(),
      completedThisWeek: z.number(),
    })
  ),
  mission: z
    .object({
      title: z.string(),
      projectName: z.string(),
      status: z.string(),
      isOverdue: z.boolean(),
    })
    .nullable(),
  workload: z.object({
    openTasks: z.number(),
    completedThisWeek: z.number(),
    overdue: z.number(),
    dueToday: z.number(),
  }),
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
  content: z.array(
    z.object({
      title: z.string(),
      contentType: z.string(),
      status: z.string(),
      scheduledFor: z.string().nullable(),
    })
  ),
  latestHarperNextMove: z.string().nullable(),
  unresolvedFeedback: z.array(
    z.object({ type: z.string(), description: z.string() })
  ),
});

export function parseStoredReneeContext(value: unknown): ReneeContext | null {
  const parsed = reneeContextSchema.safeParse(value);
  return parsed.success ? (parsed.data as ReneeContext) : null;
}

function projectSignature(context: ReneeContext): string {
  return context.projects
    .map(
      (project) =>
        `${project.name}:${project.status}:${project.openTasks}:${project.completedThisWeek}`
    )
    .sort()
    .join(",");
}

/** Content only matters strategically once it is scheduled or shipped. */
function shippedContentSignature(context: ReneeContext): string {
  return context.content
    .filter(
      (item) => item.status === "SCHEDULED" || item.status === "PUBLISHED"
    )
    .map((item) => `${item.title}:${item.status}`)
    .sort()
    .join(",");
}

/**
 * Fields that make strategic advice right or wrong. Focus minutes, feedback
 * and Harper's phrasing are excluded — they move without changing strategy.
 */
export function reneeFingerprint(context: ReneeContext): string {
  return [
    projectSignature(context),
    context.mission?.title ?? "none",
    context.mission?.projectName ?? "none",
    context.workload.openTasks,
    context.workload.completedThisWeek,
    context.workload.overdue,
    context.weeklyPacket.weeklyPriority ?? "none",
    shippedContentSignature(context),
  ].join("|");
}

export function isReneeContextStale(
  saved: ReneeContext | null,
  current: ReneeContext
): boolean {
  if (!saved) return true;
  return reneeFingerprint(saved) !== reneeFingerprint(current);
}

/**
 * Worth a model call. Ordinary task churn inside an unchanged portfolio is
 * not — that is what the deterministic strategy is for.
 */
export function isReneeSignificantChange(
  saved: ReneeContext | null,
  current: ReneeContext
): boolean {
  if (!saved) return true;

  // A project was created, completed, paused or reopened.
  const savedProjects = saved.projects
    .map((project) => `${project.name}:${project.status}`)
    .sort()
    .join(",");
  const currentProjects = current.projects
    .map((project) => `${project.name}:${project.status}`)
    .sort()
    .join(",");
  if (savedProjects !== currentProjects) return true;

  // The primary mission changed.
  if ((saved.mission?.title ?? null) !== (current.mission?.title ?? null)) {
    return true;
  }

  // A task was completed or reopened.
  if (saved.workload.completedThisWeek !== current.workload.completedThisWeek) {
    return true;
  }

  // The CEO Packet's weekly priority moved.
  if (
    saved.weeklyPacket.weeklyPriority !== current.weeklyPacket.weeklyPriority
  ) {
    return true;
  }

  // Content became scheduled or published.
  if (shippedContentSignature(saved) !== shippedContentSignature(current)) {
    return true;
  }

  return false;
}

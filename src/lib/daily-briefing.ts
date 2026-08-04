/**
 * Daily Briefing rules.
 *
 * Everything here is pure and prisma-free so it can be imported from both
 * server components and client components. The database read lives in
 * `daily-briefing.server.ts`.
 *
 * Progress and current-step derivation are NOT reimplemented here — they come
 * from `@/lib/mission`.
 */

import type { Priority, TaskStatus } from "@/generated/prisma/client";
import {
  deriveMissionProgress,
  type MissionProgress,
  type MissionStep,
} from "@/lib/mission";
import { ESTIMATED_FOCUS_MINUTES } from "@/lib/focus";

/** Minimal task shape the briefing needs. */
export interface BriefingTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: Date | null;
  updatedAt: Date;
  projectName: string;
  steps: MissionStep[];
}

export interface DailyBriefing {
  greeting: string;
  mission: BriefingTask | null;
  progress: MissionProgress;
  overdueCount: number;
  dueTodayCount: number;
  estimatedFocusMinutes: number;
  /** Exactly one sentence. */
  recommendation: string;
  missionIsOverdue: boolean;
}

export const CLEAR_FOR_TODAY = "You’re clear for today.";

const PRIORITY_RANK: Record<Priority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/** A task is actionable until it's done. */
export function isActionable(task: Pick<BriefingTask, "status">): boolean {
  return task.status !== "DONE";
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function startOfDay(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function endOfDay(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function isOverdue(task: BriefingTask, now: Date): boolean {
  if (!isActionable(task) || !task.dueDate) return false;
  return task.dueDate.getTime() < startOfDay(now).getTime();
}

export function isDueToday(task: BriefingTask, now: Date): boolean {
  if (!isActionable(task) || !task.dueDate) return false;

  const due = task.dueDate.getTime();
  return due >= startOfDay(now).getTime() && due <= endOfDay(now).getTime();
}

export function countOverdue(tasks: BriefingTask[], now: Date): number {
  return tasks.filter((task) => isOverdue(task, now)).length;
}

export function countDueToday(tasks: BriefingTask[], now: Date): number {
  return tasks.filter((task) => isDueToday(task, now)).length;
}

/**
 * Ranking buckets, best first:
 *   0 in progress
 *   1 overdue
 *   2 due today
 *   3 everything else
 *
 * Within a bucket: higher priority wins, then most recently updated. That last
 * tiebreak is what implements "highest-priority pending" followed by "most
 * recently updated pending".
 */
function rankBucket(task: BriefingTask, now: Date): number {
  if (task.status === "IN_PROGRESS") return 0;
  if (isOverdue(task, now)) return 1;
  if (isDueToday(task, now)) return 2;
  return 3;
}

/** Generic so callers with a richer task shape keep their own type back. */
export function selectPrimaryMission<T extends BriefingTask>(
  tasks: T[],
  now: Date = new Date()
): T | null {
  const actionable = tasks.filter(isActionable);
  if (actionable.length === 0) return null;

  const ranked = [...actionable].sort((a, b) => {
    const bucketDiff = rankBucket(a, now) - rankBucket(b, now);
    if (bucketDiff !== 0) return bucketDiff;

    const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return ranked[0] ?? null;
}

/** Always returns a single sentence describing one next action. */
export function buildRecommendation(
  mission: BriefingTask | null,
  progress: MissionProgress,
  now: Date = new Date()
): string {
  if (!mission) return CLEAR_FOR_TODAY;

  const overdue = isOverdue(mission, now);
  const verb = mission.status === "IN_PROGRESS" ? "Continue" : "Start";
  const label = overdue
    ? `the overdue task “${mission.title}”`
    : `“${mission.title}”`;

  if (progress.isComplete) {
    return `Close out “${mission.title}” — every step is done.`;
  }

  if (progress.currentStep) {
    return `${verb} ${label} by completing “${progress.currentStep.title}”.`;
  }

  return `${verb} ${label}.`;
}

/** Composes the whole briefing from an already-loaded task list. */
export function buildDailyBriefing(
  tasks: BriefingTask[],
  now: Date = new Date()
): DailyBriefing {
  const mission = selectPrimaryMission(tasks, now);
  const progress = deriveMissionProgress(mission?.steps ?? []);

  return {
    greeting: greetingForHour(now.getHours()),
    mission,
    progress,
    overdueCount: countOverdue(tasks, now),
    dueTodayCount: countDueToday(tasks, now),
    estimatedFocusMinutes: ESTIMATED_FOCUS_MINUTES,
    recommendation: buildRecommendation(mission, progress, now),
    missionIsOverdue: mission ? isOverdue(mission, now) : false,
  };
}

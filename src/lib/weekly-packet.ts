/**
 * Weekly CEO Packet rules.
 *
 * Pure and prisma-free, like `daily-briefing.ts`. Mission ranking, progress and
 * recommendation copy are reused from the existing utilities rather than
 * reimplemented — this module only adds the weekly aggregations.
 */

import type { ProjectStatus } from "@/generated/prisma/client";
import { deriveMissionProgress, type MissionProgress } from "@/lib/mission";
import {
  buildRecommendation,
  isActionable,
  isOverdue,
  selectPrimaryMission,
  type BriefingTask,
} from "@/lib/daily-briefing";

/** Tasks in the packet also need their project id, and may be DONE. */
export interface PacketTask extends BriefingTask {
  projectId: string;
}

export interface PacketProjectInput {
  id: string;
  name: string;
  status: ProjectStatus;
}

export interface WeekRange {
  start: Date;
  end: Date;
}

export interface WeeklyResults {
  completedThisWeek: number;
  stillOpen: number;
  overdue: number;
  focusMinutes: number;
  focusSessions: number;
}

export interface ProjectActivity {
  id: string;
  name: string;
  status: ProjectStatus;
  openTasks: number;
  completedThisWeek: number;
  hasActionableTask: boolean;
}

export type RiskKind =
  | "OVERDUE_HIGH_PRIORITY"
  | "DUE_SOON_INCOMPLETE"
  | "PROJECT_WITHOUT_TASKS";

export interface PacketRisk {
  kind: RiskKind;
  title: string;
  detail: string;
}

export interface WeeklyFocusTotals {
  focusMinutes: number;
  focusSessions: number;
}

export interface WeeklyPacket {
  range: WeekRange;
  priorityTask: PacketTask | null;
  priorityProgress: MissionProgress;
  results: WeeklyResults;
  projects: ProjectActivity[];
  risks: PacketRisk[];
  nextMove: string;
  hasWeeklyActivity: boolean;
}

export const NO_ACTIVITY = "No activity recorded this week.";

/** Risks are capped so the packet stays scannable. */
export const MAX_RISKS = 3;

const DUE_SOON_HOURS = 48;

/** Monday 00:00:00.000 through Sunday 23:59:59.999, in server-local time. */
export function getWeekRange(now: Date = new Date()): WeekRange {
  const start = new Date(now);
  // getDay(): 0 = Sunday. Shift so Monday is day 0.
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function formatWeekRange(range: WeekRange): string {
  const sameMonth = range.start.getMonth() === range.end.getMonth();
  const startLabel = range.start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = range.end.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });

  return `${startLabel} – ${endLabel}, ${range.end.getFullYear()}`;
}

function isWithin(date: Date | null, range: WeekRange): boolean {
  if (!date) return false;
  return (
    date.getTime() >= range.start.getTime() &&
    date.getTime() <= range.end.getTime()
  );
}

/**
 * There's no `completedAt` column, so "completed this week" means a DONE task
 * whose last update landed inside the week. Re-opening and re-closing a task in
 * the same week still counts once.
 */
export function isCompletedThisWeek(
  task: PacketTask,
  range: WeekRange
): boolean {
  return task.status === "DONE" && isWithin(task.updatedAt, range);
}

export function countCompletedThisWeek(
  tasks: PacketTask[],
  range: WeekRange
): number {
  return tasks.filter((task) => isCompletedThisWeek(task, range)).length;
}

export function countStillOpen(tasks: PacketTask[]): number {
  return tasks.filter(isActionable).length;
}

export function countOverdueTasks(tasks: PacketTask[], now: Date): number {
  return tasks.filter((task) => isOverdue(task, now)).length;
}

export function buildProjectActivity(
  projects: PacketProjectInput[],
  tasks: PacketTask[],
  range: WeekRange
): ProjectActivity[] {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const openTasks = projectTasks.filter(isActionable);

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      openTasks: openTasks.length,
      completedThisWeek: projectTasks.filter((task) =>
        isCompletedThisWeek(task, range)
      ).length,
      hasActionableTask: openTasks.length > 0,
    };
  });
}

function isDueWithinHours(
  task: PacketTask,
  now: Date,
  hours: number
): boolean {
  if (!isActionable(task) || !task.dueDate) return false;

  const due = task.dueDate.getTime();
  return due >= now.getTime() && due <= now.getTime() + hours * 60 * 60 * 1000;
}

/**
 * Detection order doubles as severity order: overdue high-priority work first,
 * then imminent deadlines with unfinished checklists, then stalled projects.
 * Capped at MAX_RISKS.
 */
export function detectRisks(
  tasks: PacketTask[],
  projectActivity: ProjectActivity[],
  now: Date
): PacketRisk[] {
  const risks: PacketRisk[] = [];

  for (const task of tasks) {
    if (
      isOverdue(task, now) &&
      (task.priority === "HIGH" || task.priority === "URGENT")
    ) {
      risks.push({
        kind: "OVERDUE_HIGH_PRIORITY",
        title: task.title,
        detail: `${task.priority === "URGENT" ? "Urgent" : "High"} priority · overdue · ${task.projectName}`,
      });
    }
  }

  for (const task of tasks) {
    const progress = deriveMissionProgress(task.steps);

    if (
      isDueWithinHours(task, now, DUE_SOON_HOURS) &&
      progress.hasSteps &&
      !progress.isComplete
    ) {
      risks.push({
        kind: "DUE_SOON_INCOMPLETE",
        title: task.title,
        detail: `Due within 48 hours · ${progress.completedCount}/${progress.totalSteps} steps complete`,
      });
    }
  }

  for (const project of projectActivity) {
    if (project.status === "ACTIVE" && !project.hasActionableTask) {
      risks.push({
        kind: "PROJECT_WITHOUT_TASKS",
        title: project.name,
        detail: "Active project with no actionable tasks",
      });
    }
  }

  return risks.slice(0, MAX_RISKS);
}

/**
 * Exactly one action. Falls back to project-level guidance when nothing is
 * actionable, so the packet never ends on a dead end.
 */
export function buildNextMove(
  priorityTask: PacketTask | null,
  priorityProgress: MissionProgress,
  projectActivity: ProjectActivity[],
  now: Date
): string {
  if (priorityTask) {
    return buildRecommendation(priorityTask, priorityProgress, now);
  }

  const activeProject = projectActivity.find(
    (project) => project.status === "ACTIVE"
  );

  if (activeProject) {
    return `Create the next task for “${activeProject.name}”.`;
  }

  return "Create a project to plan the week ahead.";
}

export function buildWeeklyPacket(
  tasks: PacketTask[],
  projects: PacketProjectInput[],
  focusTotals: WeeklyFocusTotals,
  now: Date = new Date()
): WeeklyPacket {
  const range = getWeekRange(now);
  const priorityTask = selectPrimaryMission(tasks, now);
  const priorityProgress = deriveMissionProgress(priorityTask?.steps ?? []);
  const projectActivity = buildProjectActivity(projects, tasks, range);

  const results: WeeklyResults = {
    completedThisWeek: countCompletedThisWeek(tasks, range),
    stillOpen: countStillOpen(tasks),
    overdue: countOverdueTasks(tasks, now),
    focusMinutes: focusTotals.focusMinutes,
    focusSessions: focusTotals.focusSessions,
  };

  return {
    range,
    priorityTask,
    priorityProgress,
    results,
    projects: projectActivity,
    risks: detectRisks(tasks, projectActivity, now),
    nextMove: buildNextMove(priorityTask, priorityProgress, projectActivity, now),
    hasWeeklyActivity:
      results.completedThisWeek > 0 ||
      results.focusSessions > 0 ||
      results.focusMinutes > 0,
  };
}

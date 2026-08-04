/**
 * Server-side data access for the Daily Briefing.
 * Kept separate from `daily-briefing.ts` so the pure rules stay importable
 * from client components without pulling prisma into the browser bundle.
 */

import { prisma } from "@/lib/prisma";
import {
  buildDailyBriefing,
  type BriefingTask,
  type DailyBriefing,
} from "@/lib/daily-briefing";

/**
 * Loads every actionable (non-DONE) task in the workspace with its checklist,
 * then applies the briefing rules. Counts must be workspace-wide, so this
 * deliberately does not reuse the dashboard's `take: 5` recent-tasks query.
 */
export async function getDailyBriefing(
  workspaceId: string,
  now: Date = new Date()
): Promise<DailyBriefing> {
  const tasks = await prisma.task.findMany({
    where: {
      project: { workspaceId },
      status: { not: "DONE" },
    },
    include: {
      project: { select: { name: true } },
      steps: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { updatedAt: "desc" },
  });

  const briefingTasks: BriefingTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    updatedAt: task.updatedAt,
    projectName: task.project.name,
    steps: task.steps.map((step) => ({
      id: step.id,
      title: step.title,
      completed: step.completed,
      position: step.position,
    })),
  }));

  return buildDailyBriefing(briefingTasks, now);
}

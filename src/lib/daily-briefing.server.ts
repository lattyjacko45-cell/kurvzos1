/**
 * Server-side data access for the Daily Briefing.
 * Kept separate from `daily-briefing.ts` so the pure rules stay importable
 * from client components without pulling prisma into the browser bundle.
 */

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  buildDailyBriefing,
  isActionable,
  type BriefingTask,
  type DailyBriefing,
} from "@/lib/daily-briefing";

/**
 * Loads every actionable (non-DONE) task in the workspace with its checklist,
 * then applies the briefing rules. Counts must be workspace-wide, so this
 * deliberately does not reuse the dashboard's `take: 5` recent-tasks query.
 */
async function loadDailyBriefing(
  workspaceId: string,
  now: Date = new Date()
): Promise<DailyBriefing> {
  const [tasks, activeProjects, totalProjects] = await Promise.all([
    prisma.task.findMany({
      where: {
        project: { workspaceId },
        status: { not: "DONE" },
      },
      include: {
        project: { select: { name: true } },
        steps: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      },
      orderBy: { updatedAt: "desc" },
    }),
    /**
     * The briefing used to see tasks only, so "no actionable task" and "nothing
     * to do" were indistinguishable — it declared the day clear while the CEO
     * Packet and Harper, which both read projects, asked for the next task.
     *
     * Same filter and ordering as the CEO Packet (`weekly-packet.server.ts`)
     * so both surfaces name the same project.
     */
    prisma.project.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
    /**
     * Counts every project regardless of status, which is what separates a
     * brand-new workspace from one whose work is genuinely finished. The
     * active-only query above cannot tell those apart, and a new user was
     * being told they were "clear for today" on an empty account.
     */
    prisma.project.count({ where: { workspaceId } }),
  ]);

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

  // Reuses the same `isActionable` predicate the mission selector and the CEO
  // Packet's `buildProjectActivity` use, rather than re-deriving "open".
  const projectIdsWithWork = new Set(
    tasks.filter(isActionable).map((task) => task.projectId)
  );

  const projectsNeedingNextTask = activeProjects
    .filter((project) => !projectIdsWithWork.has(project.id))
    .map((project) => project.name);

  return buildDailyBriefing(
    briefingTasks,
    now,
    projectsNeedingNextTask,
    totalProjects === 0
  );
}

/** Deduplicates identical reads inside one server render. */
export const getDailyBriefing = cache(loadDailyBriefing);

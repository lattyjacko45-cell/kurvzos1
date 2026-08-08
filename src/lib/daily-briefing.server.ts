/**
 * Server-side data access for the Daily Briefing.
 * Kept separate from `daily-briefing.ts` so the pure rules stay importable
 * from client components without pulling prisma into the browser bundle.
 */

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
export async function getDailyBriefing(
  workspaceId: string,
  now: Date = new Date()
): Promise<DailyBriefing> {
  const [tasks, activeProjects] = await Promise.all([
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

  return buildDailyBriefing(briefingTasks, now, projectsNeedingNextTask);
}

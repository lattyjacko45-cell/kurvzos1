/**
 * Server-side data access for the Weekly CEO Packet.
 * Mirrors the split used by `daily-briefing.server.ts`.
 */

import { prisma } from "@/lib/prisma";
import {
  buildWeeklyPacket,
  getWeekRange,
  type PacketProjectInput,
  type PacketTask,
  type WeeklyFocusTotals,
  type WeeklyPacket,
} from "@/lib/weekly-packet";

/**
 * Only COMPLETED sessions count, and only those that ended inside the week.
 * `durationMinutes` is written once when a session ends, so summing it can't
 * double-count a paused-and-resumed session.
 */
async function getWeeklyFocusTotals(
  workspaceId: string,
  start: Date,
  end: Date
): Promise<WeeklyFocusTotals> {
  const sessions = await prisma.focusSession.findMany({
    where: {
      status: "COMPLETED",
      endedAt: { gte: start, lte: end },
      task: { project: { workspaceId } },
    },
    select: { durationMinutes: true },
  });

  return {
    focusMinutes: sessions.reduce(
      (total, session) => total + (session.durationMinutes ?? 0),
      0
    ),
    focusSessions: sessions.length,
  };
}

export async function getWeeklyPacket(
  workspaceId: string,
  now: Date = new Date()
): Promise<WeeklyPacket> {
  const range = getWeekRange(now);

  // Every task, including DONE ones: the packet reports on completed work.
  const [tasks, projects, focusTotals] = await Promise.all([
    prisma.task.findMany({
      where: { project: { workspaceId } },
      include: {
        project: { select: { name: true } },
        steps: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
    }),
    getWeeklyFocusTotals(workspaceId, range.start, range.end),
  ]);

  const packetTasks: PacketTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    updatedAt: task.updatedAt,
    projectId: task.projectId,
    projectName: task.project.name,
    steps: task.steps.map((step) => ({
      id: step.id,
      title: step.title,
      completed: step.completed,
      position: step.position,
    })),
  }));

  const packetProjects: PacketProjectInput[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
  }));

  return buildWeeklyPacket(packetTasks, packetProjects, focusTotals, now);
}

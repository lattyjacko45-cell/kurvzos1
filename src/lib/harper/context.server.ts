import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import type { HarperContext } from "@/lib/harper/types";

/**
 * Assembles everything Harper is allowed to reason over.
 *
 * Two rules govern this file:
 *  1. Every query is scoped to the caller's own workspace/profile.
 *  2. Only human-readable working data leaves here — no ids, emails, tokens,
 *     env values or connection records. What this function returns is exactly
 *     what gets serialised into the prompt and stored as the snapshot.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function buildHarperContext(
  profileId: string,
  workspaceId: string,
  now: Date = new Date()
): Promise<HarperContext> {
  const since = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [briefing, packet, focusSessions, completedTasks, feedback] =
    await Promise.all([
      getDailyBriefing(workspaceId, now),
      getWeeklyPacket(workspaceId, now),
      prisma.focusSession.findMany({
        where: {
          profileId,
          status: "COMPLETED",
          endedAt: { gte: since, lte: now },
        },
        select: { durationMinutes: true },
      }),
      prisma.task.findMany({
        where: {
          project: { workspaceId },
          status: "DONE",
          updatedAt: { gte: since },
        },
        select: { title: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.feedback.findMany({
        where: { profileId, status: { in: ["NEW", "REVIEWING"] } },
        select: { type: true, description: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

  const activeProjects = packet.projects.filter(
    (project) => project.status === "ACTIVE"
  );

  return {
    generatedAt: now.toISOString(),
    mission: briefing.mission
      ? {
          title: briefing.mission.title,
          projectName: briefing.mission.projectName,
          status: briefing.mission.status,
          priority: briefing.mission.priority,
          isOverdue: briefing.missionIsOverdue,
          dueDate: briefing.mission.dueDate
            ? briefing.mission.dueDate.toISOString().slice(0, 10)
            : null,
        }
      : null,
    checklist: {
      currentStep: briefing.progress.currentStep?.title ?? null,
      nextStep: briefing.progress.nextStep?.title ?? null,
      completedSteps: briefing.progress.completedCount,
      totalSteps: briefing.progress.totalSteps,
      percent: briefing.progress.percent,
    },
    counts: {
      overdue: briefing.overdueCount,
      dueToday: briefing.dueTodayCount,
      openTasks: packet.results.stillOpen,
      completedThisWeek: packet.results.completedThisWeek,
      activeProjects: activeProjects.length,
    },
    activeProjects: activeProjects.map((project) => project.name),
    recentCompletedTasks: completedTasks.map((task) => task.title),
    focus: {
      minutesLast7Days: focusSessions.reduce(
        (total, session) => total + (session.durationMinutes ?? 0),
        0
      ),
      sessionsLast7Days: focusSessions.length,
    },
    weeklyPacket: {
      weeklyPriority: packet.priorityTask?.title ?? null,
      risks: packet.risks.map((risk) => `${risk.title} — ${risk.detail}`),
      nextMove: packet.nextMove,
    },
    unresolvedFeedback: feedback.map((entry) => ({
      type: entry.type,
      description: entry.description.slice(0, 200),
    })),
  };
}

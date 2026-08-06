import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import { getLatestHarperAdvice } from "@/lib/harper/engine.server";
import { harperAnswerSchema } from "@/lib/harper/types";
import type { ReneeContext } from "@/lib/renee/types";

/**
 * Assembles Renee's business context.
 *
 * Same two rules as Harper's builder:
 *  1. Every query is scoped to the caller's own profile/workspace.
 *  2. Only human-readable business data leaves here. No ids, emails, API keys,
 *     OAuth tokens or YouTube credentials — the content list carries titles and
 *     statuses only, never `youtubeVideoId` or connection records.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function buildReneeContext(
  profileId: string,
  workspaceId: string,
  now: Date = new Date()
): Promise<ReneeContext> {
  const since = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [
    briefing,
    packet,
    projects,
    focusSessions,
    completedTasks,
    contentItems,
    feedback,
    harper,
  ] = await Promise.all([
    getDailyBriefing(workspaceId, now),
    getWeeklyPacket(workspaceId, now),
    prisma.project.findMany({
      where: { workspaceId },
      select: { id: true, name: true, description: true, status: true },
      orderBy: { updatedAt: "desc" },
    }),
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
      take: 8,
    }),
    prisma.contentItem.findMany({
      where: { profileId },
      select: {
        title: true,
        contentType: true,
        status: true,
        scheduledAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.feedback.findMany({
      where: { profileId, status: { in: ["NEW", "REVIEWING"] } },
      select: { type: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    getLatestHarperAdvice(profileId),
  ]);

  // Project-level activity comes from the packet so Renee and the CEO Packet
  // can never disagree about who did what this week.
  const activityByProjectId = new Map(
    packet.projects.map((project) => [
      project.id,
      {
        openTasks: project.openTasks,
        completedThisWeek: project.completedThisWeek,
      },
    ])
  );

  const harperParsed = harper
    ? harperAnswerSchema.safeParse(harper.response)
    : null;

  return {
    generatedAt: now.toISOString(),
    projects: projects.map((project) => ({
      name: project.name,
      description: project.description,
      status: project.status,
      openTasks: activityByProjectId.get(project.id)?.openTasks ?? 0,
      completedThisWeek:
        activityByProjectId.get(project.id)?.completedThisWeek ?? 0,
    })),
    mission: briefing.mission
      ? {
          title: briefing.mission.title,
          projectName: briefing.mission.projectName,
          status: briefing.mission.status,
          isOverdue: briefing.missionIsOverdue,
        }
      : null,
    workload: {
      openTasks: packet.results.stillOpen,
      completedThisWeek: packet.results.completedThisWeek,
      overdue: briefing.overdueCount,
      dueToday: briefing.dueTodayCount,
    },
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
    content: contentItems.map((item) => ({
      title: item.title,
      contentType: item.contentType,
      status: item.status,
      scheduledFor: item.scheduledAt
        ? item.scheduledAt.toISOString().slice(0, 10)
        : null,
    })),
    latestHarperNextMove: harperParsed?.success
      ? harperParsed.data.nextMove
      : null,
    unresolvedFeedback: feedback.map((entry) => ({
      type: entry.type,
      description: entry.description.slice(0, 200),
    })),
  };
}

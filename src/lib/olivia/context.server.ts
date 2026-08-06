import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import { getLatestHarperAdvice } from "@/lib/harper/engine.server";
import { harperAnswerSchema } from "@/lib/harper/types";
import { getLatestReneeAdvice } from "@/lib/renee/engine.server";
import { reneeAnswerSchema } from "@/lib/renee/types";
import { getLatestSophiaAdvice } from "@/lib/sophia/engine.server";
import { sophiaAnswerSchema } from "@/lib/sophia/types";
import { CONTENT_STATUS_LABELS, type ContentStatusValue } from "@/lib/content";
import { deriveMissionProgress } from "@/lib/mission";
import type { OliviaContext } from "@/lib/olivia/types";

/**
 * Assembles Olivia's operational context.
 *
 * Same rules as the other executives: every query is scoped to the caller's
 * own profile/workspace, and only human-readable process data leaves here.
 * Step and project ids are fetched for internal joins and progress derivation
 * but are dropped before serialisation — nothing returned carries an id. Emails,
 * tokens and YouTube secrets are never selected at all.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * DAY_MS;

/** A week without a touch is the point where work reads as stalled. */
const STALLED_DAYS = 7;

/** Task stages in plain language, so no enum can leak downstream. */
const STAGE_LABELS: Record<string, string> = {
  TODO: "not started",
  IN_PROGRESS: "in progress",
  REVIEW: "in review",
  DONE: "completed",
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  COMPLETED: "completed",
};

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export async function buildOliviaContext(
  profileId: string,
  workspaceId: string,
  now: Date = new Date()
): Promise<OliviaContext> {
  const since7 = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [
    briefing,
    packet,
    openTasks,
    completedThisWeek,
    projects,
    focusSessions,
    contentItems,
    feedback,
    harper,
    renee,
    sophia,
  ] = await Promise.all([
    getDailyBriefing(workspaceId, now),
    getWeeklyPacket(workspaceId, now),
    prisma.task.findMany({
      where: { project: { workspaceId }, status: { not: "DONE" } },
      select: {
        title: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        project: { select: { name: true } },
        steps: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, completed: true, position: true },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    }),
    prisma.task.count({
      where: {
        project: { workspaceId },
        status: "DONE",
        updatedAt: { gte: since7 },
      },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      select: { id: true, name: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.focusSession.findMany({
      where: {
        profileId,
        status: "COMPLETED",
        endedAt: { gte: since7, lte: now },
      },
      select: { durationMinutes: true },
    }),
    prisma.contentItem.findMany({
      where: { profileId },
      select: { status: true },
    }),
    prisma.feedback.findMany({
      where: { profileId, status: { in: ["NEW", "REVIEWING"] } },
      select: { type: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    getLatestHarperAdvice(profileId),
    getLatestReneeAdvice(profileId),
    getLatestSophiaAdvice(profileId),
  ]);

  const withProgress = openTasks.map((task) => ({
    task,
    progress: deriveMissionProgress(task.steps),
    daysSinceUpdate: daysBetween(task.updatedAt, now),
  }));

  const tasksWithChecklist = withProgress.filter(
    (entry) => entry.progress.hasSteps
  );

  const averagePercentComplete =
    tasksWithChecklist.length > 0
      ? Math.round(
          tasksWithChecklist.reduce(
            (total, entry) => total + entry.progress.percent,
            0
          ) / tasksWithChecklist.length
        )
      : 0;

  const focusMinutes = focusSessions.reduce(
    (total, session) => total + (session.durationMinutes ?? 0),
    0
  );

  const activityByProjectId = new Map(
    packet.projects.map((project) => [project.id, project])
  );

  const contentCounts = new Map<string, number>();
  for (const item of contentItems) {
    const label = CONTENT_STATUS_LABELS[item.status as ContentStatusValue];
    contentCounts.set(label, (contentCounts.get(label) ?? 0) + 1);
  }

  const stageCounts = new Map<string, number>();
  for (const { task } of withProgress) {
    const label = STAGE_LABELS[task.status] ?? task.status.toLowerCase();
    stageCounts.set(label, (stageCounts.get(label) ?? 0) + 1);
  }

  const harperParsed = harper
    ? harperAnswerSchema.safeParse(harper.response)
    : null;
  const reneeParsed = renee
    ? reneeAnswerSchema.safeParse(renee.response)
    : null;
  const sophiaParsed = sophia
    ? sophiaAnswerSchema.safeParse(sophia.response)
    : null;

  return {
    generatedAt: now.toISOString(),
    workload: {
      openTasks: openTasks.length,
      overdueTasks: briefing.overdueCount,
      completedThisWeek,
      dueToday: briefing.dueTodayCount,
    },
    tasksByStage: [...stageCounts.entries()].map(([stage, count]) => ({
      stage,
      count,
    })),
    stalledTasks: withProgress
      .filter((entry) => entry.daysSinceUpdate >= STALLED_DAYS)
      .slice(0, 8)
      .map((entry) => ({
        title: entry.task.title,
        projectName: entry.task.project.name,
        stage: STAGE_LABELS[entry.task.status] ?? "unknown",
        daysSinceUpdate: entry.daysSinceUpdate,
      })),
    // Every step ticked but the task still open — the handoff never happened.
    finishedButOpenTasks: withProgress
      .filter((entry) => entry.progress.isComplete)
      .slice(0, 8)
      .map((entry) => ({
        title: entry.task.title,
        projectName: entry.task.project.name,
      })),
    tasksWithoutChecklist: withProgress
      .filter((entry) => !entry.progress.hasSteps)
      .slice(0, 8)
      .map((entry) => ({
        title: entry.task.title,
        projectName: entry.task.project.name,
      })),
    overdueTasks: withProgress
      .filter(
        (entry) =>
          entry.task.dueDate !== null &&
          entry.task.dueDate.getTime() < now.getTime()
      )
      .slice(0, 8)
      .map((entry) => ({
        title: entry.task.title,
        projectName: entry.task.project.name,
        daysOverdue: daysBetween(entry.task.dueDate as Date, now),
      })),
    checklistProgress: {
      tasksWithChecklist: tasksWithChecklist.length,
      tasksWithoutChecklist: withProgress.length - tasksWithChecklist.length,
      averagePercentComplete,
    },
    projects: projects.map((project) => ({
      name: project.name,
      status: PROJECT_STATUS_LABELS[project.status] ?? "unknown",
      openTasks: activityByProjectId.get(project.id)?.openTasks ?? 0,
      completedThisWeek:
        activityByProjectId.get(project.id)?.completedThisWeek ?? 0,
      hasActionableWork:
        activityByProjectId.get(project.id)?.hasActionableTask ?? false,
      daysSinceActivity: daysBetween(project.updatedAt, now),
    })),
    mission: briefing.mission
      ? {
          title: briefing.mission.title,
          projectName: briefing.mission.projectName,
          stage: STAGE_LABELS[briefing.mission.status] ?? "unknown",
          isOverdue: briefing.missionIsOverdue,
        }
      : null,
    focus: {
      sessionsLast7Days: focusSessions.length,
      minutesLast7Days: focusMinutes,
      averageSessionMinutes:
        focusSessions.length > 0
          ? Math.round(focusMinutes / focusSessions.length)
          : null,
      averageMinutesPerCompletedTask:
        completedThisWeek > 0 && focusMinutes > 0
          ? Math.round(focusMinutes / completedThisWeek)
          : null,
    },
    contentPipeline: [...contentCounts.entries()].map(([stage, count]) => ({
      stage,
      count,
    })),
    feedback: {
      unresolved: feedback.length,
      recent: feedback.slice(0, 3).map((entry) => ({
        type: entry.type.toLowerCase().replace(/_/g, " "),
        description: entry.description.slice(0, 200),
      })),
    },
    weeklyPacket: {
      risks: packet.risks.map((risk) => `${risk.title} — ${risk.detail}`),
      nextMove: packet.nextMove,
    },
    latestHarperNextMove: harperParsed?.success
      ? harperParsed.data.nextMove
      : null,
    latestReneeStrategicPriority: reneeParsed?.success
      ? reneeParsed.data.strategicPriority
      : null,
    latestSophiaMarketingPriority: sophiaParsed?.success
      ? sophiaParsed.data.marketingPriority
      : null,
  };
}

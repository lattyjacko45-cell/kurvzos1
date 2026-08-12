import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import { getConnectedWorkspaceContext } from "@/lib/workspace-context/context.server";
import { isSourceUsable } from "@/lib/workspace-context/types";
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

  /**
   * The calendar is no longer fetched here.
   *
   * It arrives inside the Connected Workspace snapshot, which the aggregator
   * builds once per request and shares with the dashboard. Reading it directly
   * as well would have been a second call for data already in hand.
   */
  const [briefing, packet, focusSessions, completedTasks, feedback, workspace] =
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
      getConnectedWorkspaceContext(profileId, workspaceId),
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
    /**
     * Unchanged shape and unchanged meaning — it is simply sourced from the
     * shared snapshot now instead of a second calendar read. Still null when
     * no calendar is connected, so the prompt rule about it still holds.
     */
    schedule:
      workspace.calendar.state === "disconnected"
        ? null
        : {
            currentEvent: workspace.calendar.currentEvent,
            nextEvent: workspace.calendar.nextEvent,
            minutesUntilNextEvent: workspace.calendar.minutesUntilNextEvent,
            eventsRemainingToday: workspace.calendar.eventsRemainingToday,
            largestFreeGapMinutes: workspace.calendar.largestFreeGapMinutes,
          },
    connectedWorkspace: workspace,
  };
}

/**
 * Whether any connected source has something to say.
 *
 * Exported for the prompt layer and tests: when every integration is
 * disconnected or silent there is nothing for Harper to be aware of, and the
 * snapshot should not encourage it to comment.
 */
export function hasConnectedWorkspaceSignal(
  context: HarperContext
): boolean {
  const workspace = context.connectedWorkspace;

  return (
    isSourceUsable(workspace.calendar.state) ||
    isSourceUsable(workspace.gmail.state) ||
    isSourceUsable(workspace.drive.state) ||
    isSourceUsable(workspace.content.state)
  );
}

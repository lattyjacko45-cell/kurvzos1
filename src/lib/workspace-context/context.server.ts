import { cache as cacheRequest } from "react";

import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getScheduleForProfile } from "@/lib/calendar/read.server";
import { getInboxForProfile } from "@/lib/gmail/read.server";
import { getDriveFilesForProfile } from "@/lib/drive/read.server";
import {
  WORKSPACE_CONTEXT_CAPS,
  buildProjectsSlice,
  buildTasksSlice,
  capList,
  emptyWorkspaceContext,
  mapSourceState,
  truncate,
  type ConnectedWorkspaceContext,
  type WorkspaceCalendarContext,
  type WorkspaceContentContext,
  type WorkspaceDriveContext,
  type WorkspaceGmailContext,
  type WorkspaceProjectsContext,
  type WorkspaceTasksContext,
} from "@/lib/workspace-context/types";

/**
 * The Connected Workspace aggregator.
 *
 * This is the ONLY place the five sources are combined. Harper and the Daily
 * Briefing both read from here, so neither of them contains a line of Google
 * API logic — they consume the existing normalized read layers second-hand.
 *
 * Three properties this file exists to guarantee:
 *
 *  1. PARTIAL FAILURE IS NORMAL. Every source is fetched through
 *     `Promise.allSettled` and each one has its own catch. A Gmail outage
 *     degrades the Gmail slice to "unavailable" and changes nothing else. No
 *     single integration can take down the briefing.
 *
 *  2. ONE AGGREGATION PER REQUEST. Wrapped in React's `cache`, so a dashboard
 *     render that needs the summary and a Harper context build that needs the
 *     snapshot share a single pass. The underlying readers keep their own TTL
 *     caches on top of that.
 *
 *  3. CAPPED AND NORMALIZED. Everything that leaves here is a plain scalar,
 *     already truncated to WORKSPACE_CONTEXT_CAPS. No Google object, Prisma
 *     row, id, token or address ever reaches a prompt.
 */

/** Content states that represent a decision the user still owes. */
const ATTENTION_STATUSES = ["FAILED", "UPLOADED"] as const;

async function loadTasksAndProjects(
  workspaceId: string,
  now: Date
): Promise<{
  tasks: WorkspaceTasksContext;
  projects: WorkspaceProjectsContext;
}> {
  // The Daily Briefing selector remains the single source of truth for "what
  // am I working on". Nothing here re-ranks or second-guesses it — the pure
  // mappers only reshape and truncate what it already decided.
  const briefing = await getDailyBriefing(workspaceId, now);

  const briefingLike = {
    missionTitle: briefing.mission?.title ?? null,
    currentStepTitle: briefing.progress.currentStep?.title ?? null,
    overdueCount: briefing.overdueCount,
    dueTodayCount: briefing.dueTodayCount,
    projectsNeedingNextTask: briefing.projectsNeedingNextTask,
  };

  return {
    tasks: buildTasksSlice(briefingLike),
    projects: buildProjectsSlice(briefingLike),
  };
}

async function loadCalendar(
  profileId: string,
  now: Date
): Promise<WorkspaceCalendarContext> {
  const result = await getScheduleForProfile(profileId, now);
  const schedule = result.schedule;

  const hasData =
    schedule.today.length > 0 ||
    schedule.nextEvent !== null ||
    schedule.currentEvent !== null;

  const minutesUntilNextEvent = schedule.nextEvent?.startsAt
    ? Math.max(
        0,
        Math.round(
          (new Date(schedule.nextEvent.startsAt).getTime() - now.getTime()) /
            60000
        )
      )
    : null;

  // Titles and times only. Attendees, organisers and meeting links are not
  // read out of the schedule at all — the calendar reader never exposes them.
  return {
    state: mapSourceState(result.state, hasData),
    timeZone: schedule.timeZone,
    currentEvent: schedule.currentEvent
      ? truncate(schedule.currentEvent.title, WORKSPACE_CONTEXT_CAPS.titleChars)
      : null,
    nextEvent: schedule.nextEvent
      ? truncate(schedule.nextEvent.title, WORKSPACE_CONTEXT_CAPS.titleChars)
      : null,
    nextEventTime: schedule.nextEvent?.displayTime ?? null,
    minutesUntilNextEvent,
    eventsRemainingToday: schedule.eventsRemainingToday,
    largestFreeGapMinutes: schedule.largestGapMinutes,
    today: capList(
      schedule.today,
      WORKSPACE_CONTEXT_CAPS.calendarTodayEvents
    ).map((event) => ({
      title: truncate(event.title, WORKSPACE_CONTEXT_CAPS.titleChars),
      displayTime: event.displayTime,
      allDay: event.allDay,
    })),
  };
}

async function loadGmail(profileId: string): Promise<WorkspaceGmailContext> {
  const result = await getInboxForProfile(profileId);

  // Unread first, then newest — the reader already sorts by date, so a stable
  // partition is enough to put what matters at the top of a short list.
  const ordered = [
    ...result.messages.filter((message) => message.isUnread),
    ...result.messages.filter((message) => !message.isUnread),
  ];

  const unreadCount = result.messages.filter(
    (message) => message.isUnread
  ).length;

  return {
    state: mapSourceState(result.state, result.messages.length > 0),
    unreadCount,
    recentCount: result.messages.length,
    // Sender display name, subject and a truncated preview. Never a body,
    // never an address, never a message id or a Gmail link.
    recent: capList(ordered, WORKSPACE_CONTEXT_CAPS.gmailMessages).map(
      (message) => ({
        from: truncate(message.from, WORKSPACE_CONTEXT_CAPS.titleChars),
        subject: truncate(message.subject, WORKSPACE_CONTEXT_CAPS.titleChars),
        snippet: truncate(
          message.snippet,
          WORKSPACE_CONTEXT_CAPS.gmailSnippetChars
        ),
        receivedAt: message.receivedAt,
        isUnread: message.isUnread,
      })
    ),
  };
}

async function loadDrive(profileId: string): Promise<WorkspaceDriveContext> {
  const result = await getDriveFilesForProfile(profileId);

  return {
    state: mapSourceState(result.state, result.files.length > 0),
    // Metadata only. File contents are not merely omitted here — the granted
    // Drive scope cannot fetch them at all.
    recent: capList(result.files, WORKSPACE_CONTEXT_CAPS.driveFiles).map(
      (file) => ({
        name: truncate(file.name, WORKSPACE_CONTEXT_CAPS.titleChars),
        typeLabel: file.typeLabel,
        modifiedAt: file.modifiedAt,
        url: file.webViewLink,
      })
    ),
  };
}

async function loadContent(
  profileId: string
): Promise<WorkspaceContentContext> {
  /**
   * Content status comes from KurvzOS's own ContentItem rows, not from
   * YouTube. The refresh-status route already reconciles those rows against
   * the live API, so calling YouTube again here would be a duplicate request
   * for information the database already holds.
   */
  const items = await prisma.contentItem.findMany({
    where: { profileId },
    select: { title: true, status: true, publishedAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const scheduled = items.filter((item) => item.status === "SCHEDULED").length;
  const processing = items.filter((item) => item.status === "PROCESSING").length;

  const needingAttention = items.filter((item) =>
    (ATTENTION_STATUSES as readonly string[]).includes(item.status)
  );

  const recentlyPublished = items
    .filter((item) => item.status === "PUBLISHED")
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
    );

  const hasData =
    scheduled > 0 ||
    processing > 0 ||
    needingAttention.length > 0 ||
    recentlyPublished.length > 0;

  return {
    // There is no connection concept for content — the rows are ours.
    state: hasData ? "connected" : "empty",
    scheduled,
    processing,
    needingAttention: capList(
      needingAttention,
      WORKSPACE_CONTEXT_CAPS.contentNeedingAttention
    ).map((item) => ({
      title: truncate(item.title, WORKSPACE_CONTEXT_CAPS.titleChars),
      status: item.status,
    })),
    recentlyPublished: capList(
      recentlyPublished,
      WORKSPACE_CONTEXT_CAPS.contentRecentlyPublished
    ).map((item) => ({
      title: truncate(item.title, WORKSPACE_CONTEXT_CAPS.titleChars),
      status: item.status,
    })),
  };
}

/** Identifiers only — never a title, subject, filename or token. */
function logSourceFailure(source: string): void {
  console.error("[workspace-context] source unavailable", {
    stage: "aggregate",
    source,
    status: null,
    reason: "source_failed",
  });
}

async function buildConnectedWorkspaceContext(
  profileId: string,
  workspaceId: string,
  now: Date
): Promise<ConnectedWorkspaceContext> {
  const fallback = emptyWorkspaceContext(now.toISOString());

  /**
   * All five run concurrently and settle independently.
   *
   * `allSettled` rather than `all` is the whole point: with `all`, one Gmail
   * 500 would reject the entire aggregation and blank a dashboard that also
   * had perfectly good calendar, drive and task data.
   */
  const [tasksResult, calendarResult, gmailResult, driveResult, contentResult] =
    await Promise.allSettled([
      loadTasksAndProjects(workspaceId, now),
      loadCalendar(profileId, now),
      loadGmail(profileId),
      loadDrive(profileId),
      loadContent(profileId),
    ]);

  if (tasksResult.status === "rejected") logSourceFailure("tasks");
  if (calendarResult.status === "rejected") logSourceFailure("calendar");
  if (gmailResult.status === "rejected") logSourceFailure("gmail");
  if (driveResult.status === "rejected") logSourceFailure("drive");
  if (contentResult.status === "rejected") logSourceFailure("content");

  return {
    generatedAt: now.toISOString(),
    tasks:
      tasksResult.status === "fulfilled"
        ? tasksResult.value.tasks
        : fallback.tasks,
    projects:
      tasksResult.status === "fulfilled"
        ? tasksResult.value.projects
        : fallback.projects,
    calendar:
      calendarResult.status === "fulfilled"
        ? calendarResult.value
        : fallback.calendar,
    gmail:
      gmailResult.status === "fulfilled" ? gmailResult.value : fallback.gmail,
    drive:
      driveResult.status === "fulfilled" ? driveResult.value : fallback.drive,
    content:
      contentResult.status === "fulfilled"
        ? contentResult.value
        : fallback.content,
  };
}

/**
 * Request-scoped so the dashboard strip and Harper's context share one pass.
 *
 * `now` is deliberately not a parameter of the cached function — a fresh Date
 * per caller would defeat the cache key. Callers that need a fixed clock can
 * use `buildConnectedWorkspaceContext` directly in tests.
 */
const getCachedContext = cacheRequest(
  (profileId: string, workspaceId: string) =>
    buildConnectedWorkspaceContext(profileId, workspaceId, new Date())
);

export function getConnectedWorkspaceContext(
  profileId: string,
  workspaceId: string
): Promise<ConnectedWorkspaceContext> {
  return getCachedContext(profileId, workspaceId);
}

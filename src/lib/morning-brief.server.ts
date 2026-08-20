import { cache } from "react";

import { getInboxForProfile } from "@/lib/gmail/read.server";
import type { GmailMessage, GmailReadState } from "@/lib/gmail/normalize";
import { getScheduleForProfile } from "@/lib/calendar/read.server";
import type { CalendarReadState } from "@/lib/calendar/read.server";
import type { DaySchedule, ScheduleEvent } from "@/lib/calendar/schedule";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import {
  classifyEmailDeterministic,
  groupClassifiedEmails,
  selectActionTodayItems,
  buildInboxSnapshot,
  type MorningBriefCategory,
} from "@/lib/morning-brief/classify";
import { detectScheduleConflicts } from "@/lib/morning-brief/schedule-conflicts";
import { buildDeterministicRecommendation } from "@/lib/morning-brief/recommendation";
import { composeMorningBrief, type MorningBrief } from "@/lib/morning-brief/compose";
import { classifyMorningBriefWithAi } from "@/lib/morning-brief/ai";

/**
 * The Harper Morning Brief orchestrator.
 *
 * Everything that touches Prisma, Google, or the AI provider lives here —
 * the actual decision logic (classification rules, conflict detection, the
 * deterministic recommendation, and how a disconnected source degrades) all
 * lives in the tested `lib/morning-brief/*` modules this file wires
 * together. Not unit tested itself, the same as `daily-briefing.server.ts`
 * and `workspace-context/context.server.ts` — isolation here is structural:
 * every read below is scoped to the caller's own `profileId` /
 * `workspaceId`, the same pattern every other reader in this app already
 * follows.
 *
 * v1 is strictly read-only and computed fresh on every request — no new
 * Prisma model, no history table. Gmail and Calendar each keep their own
 * short-lived in-process cache (see their `read.server.ts` files); this
 * function adds nothing beyond React's per-request `cache()`.
 */

export interface MorningBriefEmailRow {
  from: string;
  fromAddress: string | null;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  gmailUrl: string;
  category: MorningBriefCategory;
  isActionToday: boolean;
  reason: string;
}

export type { MorningBrief, MorningBriefCategory };
export type { MorningBriefSourceState } from "@/lib/morning-brief/compose";

interface ResolvedGmail {
  state: GmailReadState;
  messages: GmailMessage[];
}

interface ResolvedCalendar {
  state: CalendarReadState;
  schedule: DaySchedule;
}

interface ResolvedMission {
  title: string | null;
  isOverdue: boolean;
  overdueCount: number;
  dueTodayCount: number;
}

async function resolveGmail(profileId: string): Promise<ResolvedGmail> {
  try {
    const result = await getInboxForProfile(profileId);
    return { state: result.state, messages: result.messages };
  } catch {
    // A reader throwing at all (rather than returning an "error" state) is
    // not expected — the readers themselves never throw — but a Promise
    // rejection here must still degrade gracefully rather than crash the
    // page.
    return { state: "error", messages: [] };
  }
}

async function resolveCalendar(
  profileId: string,
  now: Date
): Promise<ResolvedCalendar> {
  try {
    const result = await getScheduleForProfile(profileId, now);
    return { state: result.state, schedule: result.schedule };
  } catch {
    return {
      state: "error",
      schedule: {
        timeZone: "UTC",
        today: [],
        upcoming: [],
        currentEvent: null,
        nextEvent: null,
        eventsToday: 0,
        eventsRemainingToday: 0,
        allDayEventsToday: 0,
        bookedMinutesToday: 0,
        largestGapMinutes: null,
        freeMinutesRemainingToday: 0,
        tomorrowEventCount: 0,
        nextEventAfterToday: null,
      },
    };
  }
}

async function resolveMission(
  workspaceId: string,
  now: Date
): Promise<ResolvedMission> {
  try {
    const briefing = await getDailyBriefing(workspaceId, now);
    return {
      title: briefing.mission?.title ?? null,
      isOverdue: briefing.missionIsOverdue,
      overdueCount: briefing.overdueCount,
      dueTodayCount: briefing.dueTodayCount,
    };
  } catch {
    return { title: null, isOverdue: false, overdueCount: 0, dueTodayCount: 0 };
  }
}

function toScheduleEventLike(event: ScheduleEvent) {
  return {
    title: event.title,
    displayTime: event.displayTime,
    allDay: event.allDay,
    inProgress: event.inProgress,
    startsAt: event.startsAt,
  };
}

async function loadMorningBrief(
  profileId: string,
  workspaceId: string,
  now: Date
): Promise<MorningBrief<MorningBriefEmailRow>> {
  const [gmail, calendar, mission] = await Promise.all([
    resolveGmail(profileId),
    resolveCalendar(profileId, now),
    resolveMission(workspaceId, now),
  ]);

  const conflicts = detectScheduleConflicts(
    calendar.schedule.today.map((event) => ({
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
    }))
  );

  const conflictsForPrompt = conflicts.map((conflict) => ({
    earlierTitle: conflict.earlier.title,
    laterTitle: conflict.later.title,
    overlapMinutes: conflict.overlapMinutes,
  }));

  const eventsForPrompt = calendar.schedule.today.map((event) => ({
    title: event.title,
    displayTime: event.displayTime,
    allDay: event.allDay,
  }));

  const aiResult =
    gmail.state === "connected"
      ? await classifyMorningBriefWithAi({
          emails: gmail.messages.map((message, index) => ({
            index,
            from: message.from,
            subject: message.subject,
            snippet: message.snippet,
            isUnread: message.isUnread,
          })),
          schedule: {
            timeZone: calendar.schedule.timeZone,
            events: eventsForPrompt,
            conflicts: conflictsForPrompt,
          },
          mission,
        })
      : null;

  const classifiedEmails: MorningBriefEmailRow[] = gmail.messages.map(
    (message, index) => {
      const classification =
        aiResult?.emails[index] ?? classifyEmailDeterministic(message);

      return {
        from: message.from,
        fromAddress: message.fromAddress,
        subject: message.subject,
        snippet: message.snippet,
        receivedAt: message.receivedAt,
        isUnread: message.isUnread,
        gmailUrl: message.gmailUrl,
        category: classification.category,
        isActionToday: classification.isActionToday,
        reason: classification.reason,
      };
    }
  );

  const sections = groupClassifiedEmails(classifiedEmails);
  const actionTodayItems = selectActionTodayItems(sections);
  const snapshot = buildInboxSnapshot(sections);

  const recommendation = aiResult?.recommendation
    ? { text: aiResult.recommendation, source: "AI" as const }
    : {
        text: buildDeterministicRecommendation({
          actionTodayCount: snapshot.actionTodayCount,
          moneyCount: snapshot.moneyCount,
          hasScheduleConflict: conflicts.length > 0,
          missionTitle: mission.title,
          missionIsOverdue: mission.isOverdue,
          overdueTaskCount: mission.overdueCount,
          nextEventTitle: calendar.schedule.nextEvent?.title ?? null,
        }),
        source: "FALLBACK" as const,
      };

  return composeMorningBrief({
    generatedAt: now.toISOString(),
    gmail: {
      state: gmail.state,
      sections,
      actionTodayItems,
      snapshot,
    },
    calendar: {
      state: calendar.state,
      timeZone: calendar.schedule.timeZone,
      events: calendar.schedule.today.map(toScheduleEventLike),
      conflicts,
    },
    mission,
    recommendation,
  });
}

/**
 * Request-scoped, same reasoning as `getConnectedWorkspaceContext`: `now` is
 * not a parameter of the cached function so a fresh `Date` per caller cannot
 * defeat the cache key.
 */
const getCachedMorningBrief = cache(
  (profileId: string, workspaceId: string) =>
    loadMorningBrief(profileId, workspaceId, new Date())
);

export function getMorningBrief(
  profileId: string,
  workspaceId: string
): Promise<MorningBrief<MorningBriefEmailRow>> {
  return getCachedMorningBrief(profileId, workspaceId);
}

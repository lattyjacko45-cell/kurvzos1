import { prisma } from "@/lib/prisma";
import {
  CalendarApiError,
  getCalendarAccessToken,
  listUpcomingEvents,
} from "@/lib/calendar/client";
import {
  buildDaySchedule,
  emptySchedule,
  type DaySchedule,
} from "@/lib/calendar/schedule";

/**
 * Cached calendar reads.
 *
 * Every dashboard render, Harper page and Olivia page wants the schedule. Left
 * unguarded that is several Google calls per navigation. A short in-process TTL
 * cache collapses them: the first read in a window hits Google, the rest are
 * served from memory.
 *
 * Deliberate limits for Internal Alpha:
 *  - In-process only, so it does not survive a restart and is not shared across
 *    instances. Fine for a single local server; a shared cache is the change
 *    to make when this is deployed behind more than one process.
 *  - No polling. Nothing background-refreshes; a read only happens when a page
 *    needs one and the cache is cold.
 *  - `invalidateSchedule` lets the connect/disconnect routes drop it
 *    immediately rather than serving a stale connection state.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  schedule: DaySchedule;
  fetchedAt: number;
  /** Local calendar day the entry was built for; a rollover invalidates it. */
  dayKey: string;
}

const cache = new Map<string, CacheEntry>();

export type CalendarReadState =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error";

export interface ScheduleResult {
  state: CalendarReadState;
  schedule: DaySchedule;
  /** Safe identifier only; never a message from Google. */
  reason?: string;
}

function dayKeyFor(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function invalidateSchedule(profileId: string): void {
  cache.delete(profileId);
}

export async function getScheduleForProfile(
  profileId: string,
  now: Date = new Date(),
  options: { force?: boolean } = {}
): Promise<ScheduleResult> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { profileId },
    select: { calendarTimeZone: true },
  });

  if (!connection) {
    cache.delete(profileId);
    return { state: "not_connected", schedule: emptySchedule() };
  }

  const cached = cache.get(profileId);
  const fresh =
    cached &&
    now.getTime() - cached.fetchedAt < CACHE_TTL_MS &&
    cached.dayKey === dayKeyFor(cached.schedule.timeZone, now);

  if (fresh && !options.force) {
    return { state: "connected", schedule: cached.schedule };
  }

  try {
    const accessToken = await getCalendarAccessToken(profileId);
    const { events, timeZone } = await listUpcomingEvents(accessToken, now);

    // Prefer the zone Google reports over anything stored.
    const effectiveZone = timeZone || connection.calendarTimeZone || "UTC";
    const schedule = buildDaySchedule(events, effectiveZone, now);

    cache.set(profileId, {
      schedule,
      fetchedAt: now.getTime(),
      dayKey: dayKeyFor(effectiveZone, now),
    });

    // Counts only — never a title, location, id or calendar id.
    console.info("[calendar] schedule read", {
      stage: "list_events",
      status: 200,
      reason: "ok",
      eventCount: events.length,
    });

    return { state: "connected", schedule };
  } catch (error) {
    const status =
      error instanceof CalendarApiError ? error.status : undefined;
    const reason =
      error instanceof CalendarApiError
        ? (error.errorCode ?? "request_failed")
        : "unexpected";

    console.error("[calendar] schedule read failed", {
      stage: "list_events",
      status: status ?? null,
      reason,
      eventCount: 0,
    });

    // Serve a stale entry rather than blanking the dashboard on a transient
    // failure, but still report that reconnection is needed on a 401.
    const fallback = cached?.schedule ?? emptySchedule(
      connection.calendarTimeZone
    );

    return {
      state: status === 401 || status === 403 ? "reconnect_required" : "error",
      schedule: fallback,
      reason,
    };
  }
}

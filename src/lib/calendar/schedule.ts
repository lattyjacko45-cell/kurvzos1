import type { NormalizedEvent } from "@/lib/calendar/client";

/**
 * Pure schedule derivation.
 *
 * Two rules govern the maths here:
 *  1. Day boundaries are computed in the *calendar's* timezone, taken from
 *     Google. Nothing is hardcoded to a zone.
 *  2. All-day events do not consume working time. They usually mean "this is
 *     happening today", not "24 hours are blocked", so they are counted and
 *     displayed but excluded from booked minutes and gap maths.
 */

const MINUTE_MS = 60 * 1000;

export interface ScheduleEvent {
  title: string;
  /** ISO instant, or null for an all-day event. */
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  /** Formatted in the calendar's zone, e.g. "9:30 AM". */
  displayTime: string;
  inProgress: boolean;
  location: string | null;
}

export interface DaySchedule {
  timeZone: string;
  today: ScheduleEvent[];
  upcoming: ScheduleEvent[];
  currentEvent: ScheduleEvent | null;
  nextEvent: ScheduleEvent | null;
  eventsToday: number;
  eventsRemainingToday: number;
  allDayEventsToday: number;
  /** Timed events only. */
  bookedMinutesToday: number;
  /** Largest free stretch between now and end of day, timed events only. */
  largestGapMinutes: number | null;
  /** Free minutes between now and the end of the working day. */
  freeMinutesRemainingToday: number;
  tomorrowEventCount: number;
  nextEventAfterToday: ScheduleEvent | null;
}

/** Calendar-local Y-M-D for an instant. */
function localDateKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Working-day end used for remaining-time maths, in calendar-local hours. */
const WORKDAY_END_HOUR = 18;

function localHour(instant: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(instant)
  );
}

function toScheduleEvent(
  event: NormalizedEvent,
  now: Date,
  timeZone: string
): ScheduleEvent {
  if (event.allDay) {
    return {
      title: event.title,
      startsAt: null,
      endsAt: null,
      allDay: true,
      displayTime: "All day",
      inProgress: false,
      location: event.location,
    };
  }

  const start = new Date(event.start);
  const end = new Date(event.end);

  return {
    title: event.title,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    allDay: false,
    displayTime: formatTime(start, timeZone),
    inProgress: start.getTime() <= now.getTime() && end.getTime() > now.getTime(),
    location: event.location,
  };
}

/**
 * True when an event covers the given calendar-local day. Handles multi-day
 * events, whose all-day `end` date is exclusive per Google's format.
 */
function occursOnDay(
  event: NormalizedEvent,
  dayKey: string,
  timeZone: string
): boolean {
  if (event.allDay) {
    // start and end are YYYY-MM-DD; end is exclusive.
    return dayKey >= event.start && dayKey < event.end;
  }

  const startKey = localDateKey(new Date(event.start), timeZone);
  const endKey = localDateKey(new Date(event.end), timeZone);

  return dayKey >= startKey && dayKey <= endKey;
}

export function buildDaySchedule(
  events: NormalizedEvent[],
  timeZone: string,
  now: Date = new Date()
): DaySchedule {
  const todayKey = localDateKey(now, timeZone);
  const tomorrowKey = addDaysToKey(todayKey, 1);

  const todayEvents = events.filter((event) =>
    occursOnDay(event, todayKey, timeZone)
  );
  const tomorrowEvents = events.filter((event) =>
    occursOnDay(event, tomorrowKey, timeZone)
  );

  const todaySchedule = todayEvents.map((event) =>
    toScheduleEvent(event, now, timeZone)
  );

  const timedToday = todayEvents
    .filter((event) => !event.allDay)
    .map((event) => ({
      start: new Date(event.start),
      end: new Date(event.end),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const bookedMinutesToday = timedToday.reduce(
    (total, slot) =>
      total + Math.max(0, (slot.end.getTime() - slot.start.getTime()) / MINUTE_MS),
    0
  );

  // Remaining working window: now until the local working-day end.
  const hoursLeft = Math.max(0, WORKDAY_END_HOUR - localHour(now, timeZone));
  const windowEnd = new Date(now.getTime() + hoursLeft * 60 * MINUTE_MS);

  let cursor = now.getTime();
  let largestGap = 0;

  for (const slot of timedToday) {
    if (slot.end.getTime() <= cursor) continue;

    const gap = (slot.start.getTime() - cursor) / MINUTE_MS;
    if (gap > largestGap) largestGap = gap;

    cursor = Math.max(cursor, slot.end.getTime());
  }

  const trailingGap = (windowEnd.getTime() - cursor) / MINUTE_MS;
  if (trailingGap > largestGap) largestGap = trailingGap;

  const bookedRemaining = timedToday.reduce((total, slot) => {
    const overlapStart = Math.max(slot.start.getTime(), now.getTime());
    const overlapEnd = Math.min(slot.end.getTime(), windowEnd.getTime());
    return total + Math.max(0, (overlapEnd - overlapStart) / MINUTE_MS);
  }, 0);

  const currentEvent =
    todaySchedule.find((event) => event.inProgress) ?? null;

  const futureToday = todaySchedule.filter(
    (event) =>
      !event.allDay &&
      event.startsAt !== null &&
      new Date(event.startsAt).getTime() > now.getTime()
  );

  const upcoming = events
    .map((event) => toScheduleEvent(event, now, timeZone))
    .filter(
      (event) =>
        event.allDay ||
        (event.startsAt !== null &&
          new Date(event.startsAt).getTime() > now.getTime())
    );

  const nextEventAfterToday =
    upcoming.find(
      (event) =>
        event.startsAt !== null &&
        localDateKey(new Date(event.startsAt), timeZone) !== todayKey
    ) ?? null;

  return {
    timeZone,
    today: todaySchedule,
    upcoming: upcoming.slice(0, 5),
    currentEvent,
    nextEvent: futureToday[0] ?? nextEventAfterToday,
    eventsToday: todaySchedule.length,
    eventsRemainingToday: futureToday.length,
    allDayEventsToday: todaySchedule.filter((event) => event.allDay).length,
    bookedMinutesToday: Math.round(bookedMinutesToday),
    largestGapMinutes:
      hoursLeft > 0 ? Math.max(0, Math.round(largestGap)) : null,
    freeMinutesRemainingToday: Math.max(
      0,
      Math.round(hoursLeft * 60 - bookedRemaining)
    ),
    tomorrowEventCount: tomorrowEvents.length,
    nextEventAfterToday,
  };
}

/** Empty schedule for a profile with no calendar connected. */
export function emptySchedule(timeZone = "UTC"): DaySchedule {
  return {
    timeZone,
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
  };
}

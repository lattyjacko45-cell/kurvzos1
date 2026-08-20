/**
 * Schedule conflict detection for the Harper Morning Brief.
 *
 * Dependency-free on purpose — no Prisma, no Next, no `@/` alias — so the
 * branch tests in `schedule-conflicts.test.mjs` run directly under Node's
 * type stripping, the same arrangement as `classify.ts`.
 *
 * v1 scope, deliberately: this detects that two timed blocks on today's
 * calendar overlap and says so in plain language. It does NOT know which
 * block is "more important" — Google Calendar carries no such field — so it
 * does not attempt the kind of cascading, block-by-block reallocation a human
 * chief of staff might improvise (compress this, move that to a fallback
 * day, make this one optional). It recommends an adjustment; it never
 * changes anything, and nothing here calls Google.
 */

export interface ConflictInputEvent {
  title: string;
  /** ISO instant. All-day events (no instant) are never considered for a
   *  conflict — they do not occupy a block of the day. */
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
}

export interface ScheduleConflict {
  /** The block that starts first. */
  earlier: { title: string; startsAt: string; endsAt: string };
  /** The block that starts second and cuts into the first. */
  later: { title: string; startsAt: string; endsAt: string };
  /** Minutes of overlap between the two. */
  overlapMinutes: number;
  /** One plain-language suggestion. Never a calendar mutation. */
  suggestion: string;
}

interface TimedEvent {
  title: string;
  start: number;
  end: number;
}

function toTimedEvents(events: readonly ConflictInputEvent[]): TimedEvent[] {
  return events
    .filter(
      (event): event is ConflictInputEvent & { startsAt: string; endsAt: string } =>
        !event.allDay && event.startsAt !== null && event.endsAt !== null
    )
    .map((event) => ({
      title: event.title,
      start: new Date(event.startsAt).getTime(),
      end: new Date(event.endsAt).getTime(),
    }))
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end))
    .sort((a, b) => a.start - b.start);
}

function suggestionFor(earlier: TimedEvent, later: TimedEvent, overlapMinutes: number): string {
  return (
    `“${later.title}” overlaps “${earlier.title}” by about ${overlapMinutes} ` +
    `minute${overlapMinutes === 1 ? "" : "s"}. Consider shortening one of them or ` +
    `moving “${later.title}” to a different time.`
  );
}

/**
 * Every overlapping pair among today's timed events.
 *
 * Sweeps the sorted list once: an event only needs to be compared against
 * events that start before its own end, so this is linear in practice for a
 * normal day's schedule. All-day events are excluded before this runs — they
 * do not occupy a time slot to conflict over.
 */
export function detectScheduleConflicts(
  events: readonly ConflictInputEvent[]
): ScheduleConflict[] {
  const timed = toTimedEvents(events);
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const earlier = timed[i];
      const later = timed[j];

      if (later.start >= earlier.end) break; // sorted by start: nothing further overlaps `earlier`

      const overlapStart = Math.max(earlier.start, later.start);
      const overlapEnd = Math.min(earlier.end, later.end);
      const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

      if (overlapMinutes <= 0) continue;

      conflicts.push({
        earlier: {
          title: earlier.title,
          startsAt: new Date(earlier.start).toISOString(),
          endsAt: new Date(earlier.end).toISOString(),
        },
        later: {
          title: later.title,
          startsAt: new Date(later.start).toISOString(),
          endsAt: new Date(later.end).toISOString(),
        },
        overlapMinutes,
        suggestion: suggestionFor(earlier, later, overlapMinutes),
      });
    }
  }

  return conflicts;
}

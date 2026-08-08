import Link from "next/link";

import type { DaySchedule } from "@/lib/calendar/schedule";
import type { CalendarReadState } from "@/lib/calendar/read.server";
import { SectionLabel } from "@/components/ui/section-label";

interface TodayScheduleProps {
  state: CalendarReadState;
  schedule: DaySchedule;
}

function EventRow({
  time,
  title,
  emphasis,
}: {
  time: string;
  title: string;
  emphasis?: boolean;
}) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
        {time}
      </span>

      <span className={`truncate text-sm ${emphasis ? "font-medium" : ""}`}>
        {title}
      </span>
    </li>
  );
}

/**
 * Compact schedule strip.
 *
 * Server-rendered from the cached calendar read — showing it never triggers a
 * Google call beyond the cache TTL, and never a model call.
 */
export function TodaySchedule({ state, schedule }: TodayScheduleProps) {
  if (state === "not_connected") return null;

  const { currentEvent, nextEvent } = schedule;

  // Next three still to come today, excluding whatever is running now.
  const upcomingToday = schedule.today
    .filter(
      (event) =>
        !event.inProgress &&
        (event.allDay ||
          (event.startsAt !== null &&
            new Date(event.startsAt).getTime() > Date.now()))
    )
    .slice(0, 3);

  return (
    <section
      aria-labelledby="today-schedule-heading"
      className="rounded-2xl border bg-card p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel as="h2" id={"today-schedule-heading"}>
          Today&apos;s Schedule
        </SectionLabel>

        <p className="text-xs text-muted-foreground">{schedule.timeZone}</p>
      </div>

      {state === "reconnect_required" ? (
        <p className="mt-4 text-sm">
          Calendar authorization expired.{" "}
          <Link
            href="/dashboard/settings"
            className="underline underline-offset-4"
          >
            Reconnect in Settings
          </Link>
          .
        </p>
      ) : state === "error" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The calendar could not be read just now. Showing the last known
          schedule.
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {currentEvent ? (
          <div className="space-y-1">
            <SectionLabel>
              Happening now
            </SectionLabel>

            <p className="text-sm font-medium">{currentEvent.title}</p>
          </div>
        ) : null}

        {schedule.eventsToday === 0 ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              No events today.
            </p>

            {schedule.nextEventAfterToday ? (
              <p className="text-sm">
                Next up: {schedule.nextEventAfterToday.title} ·{" "}
                {schedule.nextEventAfterToday.displayTime}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming events.
              </p>
            )}
          </div>
        ) : (
          <>
            {upcomingToday.length > 0 ? (
              <ul className="space-y-2">
                {upcomingToday.map((event) => (
                  <EventRow
                    key={`${event.title}-${event.startsAt ?? "allday"}`}
                    time={event.displayTime}
                    title={event.title}
                    emphasis={event === nextEvent}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing else scheduled today.
              </p>
            )}

            <p className="text-xs text-muted-foreground tabular-nums">
              {schedule.eventsToday}{" "}
              {schedule.eventsToday === 1 ? "event" : "events"} today ·{" "}
              {schedule.bookedMinutesToday} booked minutes
              {schedule.tomorrowEventCount > 0
                ? ` · ${schedule.tomorrowEventCount} tomorrow`
                : ""}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

import { SectionLabel } from "@/components/ui/section-label";
import type { MorningBrief, MorningBriefEmailRow } from "@/lib/morning-brief.server";

interface MorningBriefScheduleProps {
  brief: MorningBrief<MorningBriefEmailRow>;
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
 * Today's Schedule, chronologically, plus any detected conflicts.
 *
 * v1 only recommends an adjustment — nothing here can write to Google
 * Calendar, and no control on this page attempts to.
 */
export function MorningBriefSchedule({ brief }: MorningBriefScheduleProps) {
  const { schedule, calendarState } = brief;

  if (calendarState === "not_connected") return null;

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel as="h2">Today&apos;s Schedule</SectionLabel>
        {schedule.timeZone ? (
          <p className="text-xs text-muted-foreground">{schedule.timeZone}</p>
        ) : null}
      </div>

      {calendarState === "reconnect_required" ? (
        <p className="mt-4 text-sm">
          Calendar authorization expired. Reconnect in Settings to see today&apos;s
          schedule here.
        </p>
      ) : calendarState === "error" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The calendar could not be read just now.
        </p>
      ) : schedule.events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No events today.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {schedule.events.map((event) => (
            <EventRow
              key={`${event.title}-${event.startsAt ?? "allday"}`}
              time={event.allDay ? "All day" : event.displayTime}
              title={event.title}
              emphasis={event.inProgress}
            />
          ))}
        </ul>
      )}

      {schedule.conflicts.length > 0 ? (
        <div className="mt-5 space-y-3 border-t pt-4">
          <SectionLabel as="h3">Schedule Conflict Detected</SectionLabel>

          <ul className="space-y-2">
            {schedule.conflicts.map((conflict) => (
              <li
                key={`${conflict.earlier.title}-${conflict.later.title}`}
                className="text-sm leading-6 text-muted-foreground"
              >
                {conflict.suggestion}
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Harper only suggests adjustments here — nothing on your calendar
            changes automatically.
          </p>
        </div>
      ) : null}
    </section>
  );
}

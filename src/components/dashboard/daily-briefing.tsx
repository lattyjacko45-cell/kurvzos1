import { CLEAR_FOR_TODAY, type DailyBriefing } from "@/lib/daily-briefing";
import { DailyGreeting } from "@/components/dashboard/daily-greeting";
import { Separator } from "@/components/ui/separator";

interface DailyBriefingSectionProps {
  briefing: DailyBriefing;
  firstName: string | null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>

      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function DailyBriefingSection({
  briefing,
  firstName,
}: DailyBriefingSectionProps) {
  const {
    mission,
    progress,
    overdueCount,
    dueTodayCount,
    estimatedFocusMinutes,
    recommendation,
    missionIsOverdue,
  } = briefing;

  return (
    <section className="rounded-3xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Daily Briefing
        </p>

        <div className="flex items-center gap-2 text-xs tabular-nums">
          <span className="rounded-full border px-2.5 py-1 font-medium">
            {overdueCount} overdue
          </span>

          <span className="rounded-full border px-2.5 py-1 font-medium">
            {dueTodayCount} due today
          </span>
        </div>
      </div>

      <p className="mt-4 text-lg font-medium tracking-tight">
        <DailyGreeting
          serverGreeting={briefing.greeting}
          firstName={firstName}
        />
      </p>

      {mission ? (
        <>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Metric
              label={missionIsOverdue ? "Primary Mission · Overdue" : "Primary Mission"}
              value={mission.title}
            />

            <Metric
              label="Current Step"
              value={
                progress.currentStep?.title ??
                (progress.hasSteps ? "All steps complete" : "No checklist yet")
              }
            />

            <Metric
              label="Estimated Focus"
              value={`${estimatedFocusMinutes} min`}
            />
          </div>

          <Separator className="my-5" />

          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Recommended next action
            </p>

            <p className="text-sm leading-6">{recommendation}</p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {CLEAR_FOR_TODAY}
        </p>
      )}
    </section>
  );
}

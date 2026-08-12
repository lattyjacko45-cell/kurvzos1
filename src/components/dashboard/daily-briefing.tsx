import { type DailyBriefing } from "@/lib/daily-briefing";
import { DailyGreeting } from "@/components/dashboard/daily-greeting";
import { Separator } from "@/components/ui/separator";
import { SectionLabel } from "@/components/ui/section-label";

interface DailyBriefingSectionProps {
  briefing: DailyBriefing;
  firstName: string | null;
  /**
   * "primary" is used only when this card owns the dashboard's action zone —
   * that is, when there is no mission. It enlarges the recommendation to the
   * display serif so the ask carries the same weight a mission title would.
   * The wording is identical in both variants; only its size changes.
   */
  emphasis?: "default" | "primary";
  /**
   * An existing action to surface beneath the recommendation, e.g. the shared
   * Create Task dialog. Rendered in the "primary" variant only. No new
   * workflow is introduced here — the caller passes a component that already
   * exists elsewhere in the app.
   */
  action?: React.ReactNode;
  /**
   * Slot for the compact Connected Workspace strip, rendered below the
   * recommendation.
   *
   * A ReactNode rather than data on purpose: the caller wraps it in Suspense so
   * the Gmail and Drive reads stream in *after* the mission card has painted.
   * Passing a resolved summary here would have put two Google round trips in
   * front of the page's primary decision.
   *
   * Optional, so the briefing renders exactly as before when nothing is
   * supplied — the task and project intelligence above is untouched by this.
   */
  workspaceSlot?: React.ReactNode;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <SectionLabel>
        {label}
      </SectionLabel>

      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function DailyBriefingSection({
  briefing,
  firstName,
  emphasis = "default",
  action,
  workspaceSlot,
}: DailyBriefingSectionProps) {
  const isPrimary = emphasis === "primary";

  const {
    mission,
    progress,
    overdueCount,
    dueTodayCount,
    estimatedFocusMinutes,
    recommendation,
    missionIsOverdue,
    projectsNeedingNextTask,
  } = briefing;

  const needsNextTask = projectsNeedingNextTask.length > 0;

  return (
    <section
      className={`rounded-2xl border bg-card ${isPrimary ? "p-8" : "p-6"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>
          Daily Briefing
        </SectionLabel>

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
            <SectionLabel>
              Recommended next action
            </SectionLabel>

            <p className="text-sm leading-6">{recommendation}</p>
          </div>
        </>
      ) : needsNextTask || briefing.isEmptyWorkspace ? (
        /* Two different asks, one treatment: an active project out of tasks,
           and a workspace with nothing in it yet. Both are real next actions,
           so both get the action label rather than the quiet clear-day note. */
        <div className={isPrimary ? "mt-6 space-y-3" : "mt-5 space-y-1"}>
          <SectionLabel>
            Recommended next action
          </SectionLabel>

          <p
            className={
              isPrimary
                ? "font-serif text-display-sm"
                : "text-sm leading-6"
            }
          >
            {recommendation}
          </p>

          {isPrimary && action ? <div className="pt-2">{action}</div> : null}
        </div>
      ) : (
        /* Genuinely clear. Stays quiet on purpose: no action is surfaced,
           because inventing one here would manufacture work that does not
           exist. */
        <div className={isPrimary ? "mt-6 space-y-3" : "mt-3"}>
          <p
            className={
              isPrimary
                ? "font-serif text-display-sm text-muted-foreground"
                : "text-sm leading-6 text-muted-foreground"
            }
          >
            {recommendation}
          </p>

          {isPrimary && action ? <div className="pt-2">{action}</div> : null}
        </div>
      )}

      {/*
        Connected Workspace awareness, below the recommendation rather than
        beside it — the task decision stays the point of this card, and this is
        context around it. Streamed in by the caller, and renders nothing at
        all when every source is disconnected or silent.
      */}
      {workspaceSlot}
    </section>
  );
}

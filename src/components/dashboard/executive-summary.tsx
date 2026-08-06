import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ExecutiveSummaryProps {
  harperNextMove: string;
  reneeStrategicPriority: string;
}

/**
 * Compact Executive Team strip.
 *
 * Deliberately two lines: the dashboard already carries Mission Control, the
 * Daily Briefing, the mission card and the stats grid. Both values are read
 * from saved advice (or the deterministic view) on the server — rendering the
 * dashboard never triggers a model call.
 */
export function ExecutiveSummary({
  harperNextMove,
  reneeStrategicPriority,
}: ExecutiveSummaryProps) {
  return (
    <section
      aria-labelledby="executive-summary-heading"
      className="rounded-3xl border bg-card p-6 shadow-sm"
    >
      <h2
        id="executive-summary-heading"
        className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
      >
        Executive Team
      </h2>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Harper · next move
            </p>

            <p className="text-sm leading-6">{harperNextMove}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            render={<Link href="/executive-team/harper" />}
          >
            Open Harper
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Renee · strategic priority
            </p>

            <p className="text-sm leading-6">{reneeStrategicPriority}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            render={<Link href="/executive-team/renee" />}
          >
            Open Renee
          </Button>
        </div>
      </div>
    </section>
  );
}

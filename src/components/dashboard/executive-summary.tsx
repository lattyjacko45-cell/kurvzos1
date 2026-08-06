import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ExecutiveSummaryProps {
  harperNextMove: string;
  reneeStrategicPriority: string;
  sophiaMarketingPriority: string;
}

interface ExecutiveCellProps {
  label: string;
  value: string;
  href: string;
  action: string;
}

function ExecutiveCell({ label, value, href, action }: ExecutiveCellProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </p>

        <p className="text-sm leading-6">{value}</p>
      </div>

      {/* Base UI substitutes the `render` element for the button rather than
          nesting it, so the Link itself becomes the control. nativeButton is
          set false because that control is an anchor, not a native button. */}
      <Button
        variant="outline"
        size="sm"
        className="mt-auto w-fit"
        nativeButton={false}
        render={<Link href={href} />}
      >
        {action}
      </Button>
    </div>
  );
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
  sophiaMarketingPriority,
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

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <ExecutiveCell
          label="Harper · next move"
          value={harperNextMove}
          href="/executive-team/harper"
          action="Open Harper"
        />

        <ExecutiveCell
          label="Renee · strategic priority"
          value={reneeStrategicPriority}
          href="/executive-team/renee"
          action="Open Renee"
        />

        <ExecutiveCell
          label="Sophia · marketing priority"
          value={sophiaMarketingPriority}
          href="/executive-team/sophia"
          action="Open Sophia"
        />
      </div>
    </section>
  );
}

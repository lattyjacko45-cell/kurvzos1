import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";

interface ExecutiveSummaryProps {
  harperNextMove: string;
  reneeStrategicPriority: string;
  sophiaMarketingPriority: string;
  oliviaOperationsPriority: string;
  marcusFinancialPriority: string;
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
        <SectionLabel>
          {label}
        </SectionLabel>

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
  oliviaOperationsPriority,
  marcusFinancialPriority,
}: ExecutiveSummaryProps) {
  return (
    <section
      aria-labelledby="executive-summary-heading"
      className="rounded-2xl border bg-card p-6"
    >
      <SectionLabel as="h2" id={"executive-summary-heading"}>
        Executive Team
      </SectionLabel>

      {/* One column on phones, two on tablets, three then five on wide
          screens — the cells stay readable rather than collapsing to slivers. */}
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
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

        <ExecutiveCell
          label="Olivia · operations priority"
          value={oliviaOperationsPriority}
          href="/executive-team/olivia"
          action="Open Olivia"
        />

        <ExecutiveCell
          label="Marcus · financial priority"
          value={marcusFinancialPriority}
          href="/executive-team/marcus"
          action="Open Marcus"
        />
      </div>
    </section>
  );
}

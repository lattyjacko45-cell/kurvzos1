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
  /** Priority type, e.g. "Next Move". Rendered as the eyebrow. */
  priority: string;
  /** Executive name, e.g. "Harper". Rendered as the card title. */
  name: string;
  value: string;
  href: string;
  action: string;
}

function ExecutiveCell({
  priority,
  name,
  value,
  href,
  action,
}: ExecutiveCellProps) {
  return (
    /*
      Echoes the approved /executive-team roster card: eyebrow, then the name in
      the display serif, then the supporting sentence, with the action pinned to
      the bottom edge. flex-1 on the advice is what absorbs the slack, so every
      Open button lands on the same line regardless of sentence length.
    */
    <div className="flex h-full flex-col rounded-2xl border bg-card p-6">
      <SectionLabel>
        {priority}
      </SectionLabel>

      <p className="mt-1.5 font-serif text-heading text-foreground">{name}</p>

      <p className="mt-3 flex-1 text-sm leading-6">{value}</p>

      {/* Base UI substitutes the `render` element for the button rather than
          nesting it, so the Link itself becomes the control. nativeButton is
          set false because that control is an anchor, not a native button. */}
      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-fit"
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
    /* No outer card: the five executives are the cards here, and wrapping them
       in a sixth would nest surfaces. */
    <section aria-labelledby="executive-summary-heading">
      <SectionLabel as="h2" id={"executive-summary-heading"}>
        Executive Team
      </SectionLabel>

      {/* Two columns from sm up. Five cards means Marcus falls naturally into
          the last left-hand position. */}
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <ExecutiveCell
          priority="Next Move"
          name="Harper"
          value={harperNextMove}
          href="/executive-team/harper"
          action="Open Harper"
        />

        <ExecutiveCell
          priority="Strategic Priority"
          name="Renee"
          value={reneeStrategicPriority}
          href="/executive-team/renee"
          action="Open Renee"
        />

        <ExecutiveCell
          priority="Marketing Priority"
          name="Sophia"
          value={sophiaMarketingPriority}
          href="/executive-team/sophia"
          action="Open Sophia"
        />

        <ExecutiveCell
          priority="Operations Priority"
          name="Olivia"
          value={oliviaOperationsPriority}
          href="/executive-team/olivia"
          action="Open Olivia"
        />

        <ExecutiveCell
          priority="Financial Priority"
          name="Marcus"
          value={marcusFinancialPriority}
          href="/executive-team/marcus"
          action="Open Marcus"
        />
      </div>
    </section>
  );
}

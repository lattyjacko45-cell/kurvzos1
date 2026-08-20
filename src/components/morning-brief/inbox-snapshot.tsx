import { SectionLabel } from "@/components/ui/section-label";
import type { MorningBrief, MorningBriefEmailRow } from "@/lib/morning-brief.server";

interface InboxSnapshotProps {
  brief: MorningBrief<MorningBriefEmailRow>;
}

/**
 * The compact, single-line inbox snapshot.
 *
 * Matches the spec's literal example format — six figures, always rendered,
 * because this is an at-a-glance strip rather than a "say nothing when
 * empty" narrative block. Unsubscribe candidates are tracked in the data but
 * deliberately left out of this line, exactly as the worked example shows;
 * that count still appears on its own section heading below.
 */
export function InboxSnapshot({ brief }: InboxSnapshotProps) {
  if (brief.gmailState !== "connected") return null;

  const { snapshot } = brief;

  const parts = [
    `${snapshot.actionTodayCount} Action Today`,
    `${snapshot.moneyCount} Money`,
    `${snapshot.businessCount} Business`,
    `${snapshot.careerCount} Career`,
    `${snapshot.canWaitCount} Can Wait`,
    `${snapshot.junkCount} Potential Junk`,
  ];

  return (
    <section className="rounded-2xl border bg-card p-6">
      <SectionLabel>Inbox Snapshot</SectionLabel>
      <p className="mt-3 text-sm tabular-nums leading-6 text-foreground">
        {parts.join(" · ")}
      </p>
    </section>
  );
}

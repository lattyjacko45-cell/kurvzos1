import Link from "next/link";

import { InboxSnapshot } from "@/components/morning-brief/inbox-snapshot";
import {
  CategorySection,
  NeedsActionToday,
} from "@/components/morning-brief/inbox-sections";
import { MorningBriefSchedule } from "@/components/morning-brief/morning-brief-schedule";
import { RecommendationCallout } from "@/components/morning-brief/recommendation-callout";
import type { MorningBrief, MorningBriefEmailRow } from "@/lib/morning-brief.server";

interface MorningBriefViewProps {
  brief: MorningBrief<MorningBriefEmailRow>;
}

const CATEGORY_SECTIONS: Array<{
  key: keyof MorningBrief<MorningBriefEmailRow>["sections"];
  label: string;
  description?: string;
}> = [
  { key: "moneyAndAccounts", label: "Money + Accounts" },
  {
    key: "kurvzProformance",
    label: "Kurvz Proformance / Business",
    description: "Business inquiries, collaborations and brand opportunities.",
  },
  { key: "careerAndOpportunities", label: "Career + Opportunities" },
  { key: "canWait", label: "Can Wait" },
  {
    key: "potentialJunk",
    label: "Potential Junk / Delete Candidates",
    description: "Flagged for your review only — nothing is deleted automatically.",
  },
  {
    key: "unsubscribeCandidates",
    label: "Unsubscribe Candidates",
    description:
      "Legitimate senders that may no longer be worth the space in your inbox.",
  },
];

/**
 * The full Harper Morning Brief, read-only end to end.
 *
 * Section order matches the spec exactly: Needs Action Today first, then the
 * six content categories, then today's schedule and any conflicts, closing
 * with Harper's short recommendation. Every email renders in exactly one
 * content section; "Needs Action Today" is a rollup over the same data, not
 * a second copy of it.
 */
export function MorningBriefView({ brief }: MorningBriefViewProps) {
  const gmailUnavailable = brief.gmailState !== "connected";
  const calendarUnavailable =
    brief.calendarState !== "connected" && brief.calendarState !== "not_connected";

  return (
    <div className="space-y-6">
      {gmailUnavailable || calendarUnavailable ? (
        <section
          role="status"
          className="space-y-2 rounded-2xl border border-dashed p-5 text-sm"
        >
          {brief.gmailState === "not_connected" ? (
            <p>
              Connect Gmail from the{" "}
              <Link href="/inbox" className="underline underline-offset-4">
                Inbox
              </Link>{" "}
              to include it in this brief.
            </p>
          ) : brief.gmailState === "reconnect_required" ? (
            <p>Gmail needs to be reconnected — visit the Inbox page to fix this.</p>
          ) : brief.gmailState === "error" ? (
            <p className="text-muted-foreground">
              Gmail could not be read just now, so this brief is showing what it
              has without it.
            </p>
          ) : null}

          {calendarUnavailable ? (
            <p className="text-muted-foreground">
              The calendar could not be read just now, so today&apos;s schedule is
              not shown below.
            </p>
          ) : null}
        </section>
      ) : null}

      <InboxSnapshot brief={brief} />

      <NeedsActionToday emails={brief.actionTodayItems} />

      {CATEGORY_SECTIONS.map(({ key, label, description }) => (
        <CategorySection
          key={key}
          label={label}
          description={description}
          emails={brief.sections[key]}
        />
      ))}

      {brief.gmailState === "connected" &&
      Object.values(brief.sections).every((list) => list.length === 0) ? (
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            No recent mail to triage right now.
          </p>
        </section>
      ) : null}

      <MorningBriefSchedule brief={brief} />

      <RecommendationCallout brief={brief} />
    </div>
  );
}

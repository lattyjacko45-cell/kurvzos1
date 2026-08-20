import { ExternalLinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { buttonVariants } from "@/components/ui/button";
import { formatMessageTimestamp } from "@/lib/gmail/normalize";
import { cn } from "@/lib/utils";
import type { MorningBriefEmailRow } from "@/lib/morning-brief.server";

/**
 * One email's full detail row. Rendered exactly ONCE per email, inside its
 * one primary category section — never in the Needs Action Today rollup,
 * which uses the lighter `ActionTodayRefRow` below instead. That split is
 * what keeps an urgent Money item from ever appearing as two rows.
 */
function EmailRow({ email }: { email: MorningBriefEmailRow }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">
          {email.isUnread ? (
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-1.5 rounded-full bg-primary align-middle"
            />
          ) : null}
          {email.from}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {email.isActionToday ? (
            <Badge variant="destructive" className="uppercase tracking-wide">
              Action Today
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {formatMessageTimestamp(email.receivedAt)}
          </span>
        </div>
      </div>

      <p className="mt-0.5 truncate text-sm">{email.subject}</p>

      {email.snippet ? (
        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
          {email.snippet}
        </p>
      ) : null}

      <p className="mt-1 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{email.reason}</span>

        <a
          href={email.gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-6 px-2 text-xs")}
        >
          <ExternalLinkIcon className="size-3" />
          Open
        </a>
      </p>
    </li>
  );
}

interface CategorySectionProps {
  label: string;
  description?: string;
  emails: MorningBriefEmailRow[];
}

/** One of the six content sections. Renders nothing when it has no items —
 *  an empty "Career + Opportunities" heading is not information. */
export function CategorySection({ label, description, emails }: CategorySectionProps) {
  if (emails.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel as="h2">{label}</SectionLabel>
        <span className="text-xs tabular-nums text-muted-foreground">
          {emails.length} {emails.length === 1 ? "message" : "messages"}
        </span>
      </div>

      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}

      <ul className="mt-3 divide-y">
        {emails.map((email) => (
          <EmailRow key={`${email.from}-${email.subject}-${email.receivedAt}`} email={email} />
        ))}
      </ul>
    </section>
  );
}

const CATEGORY_LABELS: Record<MorningBriefEmailRow["category"], string> = {
  MONEY_AND_ACCOUNTS: "Money + Accounts",
  KURVZ_PROFORMANCE: "Kurvz Proformance / Business",
  CAREER_AND_OPPORTUNITIES: "Career + Opportunities",
  CAN_WAIT: "Can Wait",
  POTENTIAL_JUNK: "Potential Junk",
  UNSUBSCRIBE_CANDIDATE: "Unsubscribe Candidate",
};

/**
 * A single reference line inside the "Needs Action Today" rollup —
 * intentionally lighter than `EmailRow` (no snippet, no external link) so it
 * reads as a pointer into the section below rather than a duplicate row.
 */
function ActionTodayRefRow({ email }: { email: MorningBriefEmailRow }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
      <p className="min-w-0 truncate text-sm">
        <span className="font-medium">{email.from}</span>
        <span className="text-muted-foreground"> — {email.subject}</span>
      </p>

      <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
        {CATEGORY_LABELS[email.category]}
      </Badge>
    </li>
  );
}

interface NeedsActionTodayProps {
  emails: MorningBriefEmailRow[];
}

/**
 * Section 1 — a rollup, not a bucket. Every row here also lives, in full, in
 * its own category section below; this list exists so "what needs attention
 * today" is scannable first without repeating the full row markup.
 */
export function NeedsActionToday({ emails }: NeedsActionTodayProps) {
  if (emails.length === 0) return null;

  return (
    <section className="rounded-2xl border bg-card p-6">
      <SectionLabel as="h2">Needs Action Today</SectionLabel>

      <ul className="mt-3 divide-y">
        {emails.map((email) => (
          <ActionTodayRefRow
            key={`${email.from}-${email.subject}-${email.receivedAt}`}
            email={email}
          />
        ))}
      </ul>
    </section>
  );
}

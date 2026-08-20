/**
 * Deterministic email classification for the Harper Morning Brief.
 *
 * Dependency-free on purpose — no Prisma, no Next, no `@/` alias, no network —
 * so the branch tests in `classify.test.mjs` run directly under Node's type
 * stripping, the same arrangement as `gmail/normalize.ts` and
 * `gmail/failure.ts`. Keep it that way.
 *
 * This is the FALLBACK path. When an AI provider is configured, `ai.ts`
 * classifies the inbox in one call and this module is not consulted for that
 * request — but every rule here must still stand on its own, because this is
 * exactly what runs when no provider is configured, the call fails, or the
 * model's response does not validate. The page must be fully useful on this
 * path alone.
 *
 * One rule governs the whole module: every email gets exactly ONE primary
 * category. "Needs Action Today" is not a category — it is a boolean flag
 * (`isActionToday`) layered on top of a category. A failed payment is
 * `MONEY_AND_ACCOUNTS` with `isActionToday: true`, not a duplicate row in a
 * separate bucket. Callers render the "Needs Action Today" section as a
 * lightweight rollup over `isActionToday`, never as a second copy of the row.
 */

export type MorningBriefCategory =
  | "MONEY_AND_ACCOUNTS"
  | "KURVZ_PROFORMANCE"
  | "CAREER_AND_OPPORTUNITIES"
  | "CAN_WAIT"
  | "POTENTIAL_JUNK"
  | "UNSUBSCRIBE_CANDIDATE";

/** The minimum a rule needs to see. Deliberately narrower than GmailMessage —
 *  this module has no reason to know about ids, threads or Gmail URLs. */
export interface ClassificationInput {
  from: string;
  subject: string;
  snippet: string;
  isUnread: boolean;
}

export interface ClassificationResult {
  category: MorningBriefCategory;
  isActionToday: boolean;
  /** One short human-readable reason, e.g. "Payment failed". Never a template
   *  the UI has to re-derive — this is what gets shown as the row's subline. */
  reason: string;
}

function textOf(input: ClassificationInput): string {
  return `${input.from}\n${input.subject}\n${input.snippet}`.toLowerCase();
}

/** Money/account signals that mean "act on this today". Checked first: a
 *  failed payment must never fall through to a softer bucket.
 *
 *  The payment/card/renewal patterns below allow a bounded run of
 *  non-sentence-ending characters between the subject (payment, card,
 *  renewal) and the failure word, e.g. "payment to VEED LIMITED was
 *  unsuccessful again" or "renewal failed for your plan" — real senders
 *  routinely put a merchant name, amount or plan name in between. The
 *  window is capped at 40-60 characters and stops at `.`, `!`, `?` or a
 *  newline so it can't drift into an unrelated later sentence (e.g. a
 *  genuine "payment was successful" followed later by an unrelated
 *  "failed" elsewhere in the message). */
const MONEY_URGENT_PATTERNS: RegExp[] = [
  /payment[^.!?\n]{0,60}(unsuccessful|declined|failed|failure|didn'?t work|did not work|wasn'?t (successful|processed)|couldn'?t be processed|could not be processed)/,
  /(failed|unable|couldn'?t) to (process|charge|collect)/,
  /card[^.!?\n]{0,40}(declined|rejected|didn'?t work|did not work)/,
  /card (is )?expir/,
  /(invoice|bill|balance) (is )?(overdue|past due)/,
  /past due/,
  /action required/,
  /account (has been |is )?suspended/,
  /suspicious (sign-?in|login|activity|charge)/,
  /unusual (sign-?in|login|activity)/,
  /new sign-?in (to|on) your/,
  /security alert/,
  /verify your (account|identity|payment)/,
  /update your (billing|payment) (info|information|method)/,
  /(renewal|subscription renewal|auto-?renewal)[^.!?\n]{0,40}(failed|unsuccessful|declined|didn'?t (go through|work)|did not (go through|work))/,
  /failed (renewal|to renew|to charge|to bill)/,
];

/** Money/account signals that are informational, not urgent. */
const MONEY_ROUTINE_PATTERNS: RegExp[] = [
  /receipt/,
  /invoice/,
  /subscription/,
  /renew(al|s|ed|ing)?/,
  /(statement|bill) is ready/,
  /payment (received|confirmed|successful)/,
  /auto-?pay/,
  /account statement/,
  /order confirmation/,
];

/** Career and opportunity signals. */
const CAREER_PATTERNS: RegExp[] = [
  /job alert/,
  /new jobs? (for|matching|that match)/,
  /you'?re invited to apply/,
  /application (received|update|status|submitted)/,
  /interview/,
  /recruiter/,
  /hiring (for|now)/,
  /career opportunit/,
  /(open|new) (role|position) at/,
  /join our team/,
  /talent (acquisition|team)/,
];

/** Job-title-shaped words that, combined with a company-looking sender or an
 *  em/en dash subject, mark a job-board style alert (e.g. "American Airlines
 *  — Airport Customer Operations"). Narrow on purpose to avoid false
 *  positives on ordinary business mail. */
const JOB_TITLE_WORDS =
  /\b(operations?|manager|specialist|analyst|engineer|coordinator|representative|director|associate|officer|technician)\b/;
const DASH_SEPARATED_SUBJECT = /\s[—–-]\s/;

/** Business/collaboration signals for Kurvz Proformance. */
const BUSINESS_PATTERNS: RegExp[] = [
  /collaborat/,
  /partnership/,
  /sponsorship/,
  /brand deal/,
  /work with (you|us)/,
  /(new )?(business )?inquiry/,
  /proposal/,
  /quote request/,
  /new (lead|client)/,
  /business opportunit/,
  /media kit/,
  /press (inquiry|request)/,
  /interested in your (services|content|channel|brand)/,
  /let'?s (work together|collab)/,
];

/** Promotional / low-value noise. */
const JUNK_PATTERNS: RegExp[] = [
  /\d+% off/,
  /sale ends/,
  /limited time/,
  /come back and save/,
  /we miss you/,
  /special offer/,
  /exclusive deal/,
  /flash sale/,
  /free shipping/,
  /win a /,
  /you'?ve been selected/,
  /claim your/,
  /don'?t miss out/,
  /last chance/,
  /liked your/,
  /commented on your/,
  /new follower/,
  /tagged you/,
  /friend request/,
  /people you may know/,
];

/** Recurring legitimate senders whose value has likely worn thin. */
const UNSUBSCRIBE_PATTERNS: RegExp[] = [
  /newsletter/,
  /digest/,
  /weekly (roundup|recap|update)/,
  /this week in/,
  /top stories/,
  /blog update/,
  /daily roundup/,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function looksLikeJobAlert(input: ClassificationInput): boolean {
  const subject = input.subject.toLowerCase();
  const from = input.from.toLowerCase();

  if (/\b(job|jobs|career|careers|hiring|recruiting|talent)\b/.test(from)) {
    return true;
  }

  return DASH_SEPARATED_SUBJECT.test(subject) && JOB_TITLE_WORDS.test(subject);
}

/**
 * Classifies one email, deterministically.
 *
 * Rule order is the whole algorithm: money-urgent beats everything (a failed
 * payment is never softened into "can wait"), career and business signals
 * come next since they are the highest-value non-urgent mail, then routine
 * money, then the two low-value buckets, with "can wait" as the honest
 * default when nothing matches.
 */
export function classifyEmailDeterministic(
  input: ClassificationInput
): ClassificationResult {
  const text = textOf(input);

  if (matchesAny(text, MONEY_URGENT_PATTERNS)) {
    return {
      category: "MONEY_AND_ACCOUNTS",
      isActionToday: true,
      reason: "Needs a response on a payment or account issue.",
    };
  }

  const careerUrgent =
    /interview/.test(text) || /respond by|deadline|by (today|tomorrow|eod)/.test(text);

  if (matchesAny(text, CAREER_PATTERNS) || looksLikeJobAlert(input)) {
    return {
      category: "CAREER_AND_OPPORTUNITIES",
      isActionToday: careerUrgent,
      reason: careerUrgent
        ? "A career opportunity with a time-sensitive next step."
        : "A career or job opportunity to review.",
    };
  }

  const businessUrgent =
    /urgent|deadline|time.sensitive|by (today|tomorrow|eod|end of day)/.test(
      text
    );

  if (matchesAny(text, BUSINESS_PATTERNS)) {
    return {
      category: "KURVZ_PROFORMANCE",
      isActionToday: businessUrgent,
      reason: businessUrgent
        ? "A business inquiry that reads time-sensitive."
        : "A business or collaboration inquiry.",
    };
  }

  if (matchesAny(text, MONEY_ROUTINE_PATTERNS)) {
    return {
      category: "MONEY_AND_ACCOUNTS",
      isActionToday: false,
      reason: "Routine billing or account activity.",
    };
  }

  if (matchesAny(text, JUNK_PATTERNS)) {
    return {
      category: "POTENTIAL_JUNK",
      isActionToday: false,
      reason: "Reads like a promotion or automated social notification.",
    };
  }

  if (matchesAny(text, UNSUBSCRIBE_PATTERNS)) {
    return {
      category: "UNSUBSCRIBE_CANDIDATE",
      isActionToday: false,
      reason: "A recurring newsletter or digest.",
    };
  }

  return {
    category: "CAN_WAIT",
    isActionToday: false,
    reason: "No strong signal either way — safe to read later.",
  };
}

// ---------------------------------------------------------------------------
// Grouping — generic over any classified item, not just Gmail messages
// ---------------------------------------------------------------------------

export interface CategorizedItem {
  category: MorningBriefCategory;
  isActionToday: boolean;
}

export interface MorningBriefSections<T extends CategorizedItem> {
  moneyAndAccounts: T[];
  kurvzProformance: T[];
  careerAndOpportunities: T[];
  canWait: T[];
  potentialJunk: T[];
  unsubscribeCandidates: T[];
}

function emptySections<T extends CategorizedItem>(): MorningBriefSections<T> {
  return {
    moneyAndAccounts: [],
    kurvzProformance: [],
    careerAndOpportunities: [],
    canWait: [],
    potentialJunk: [],
    unsubscribeCandidates: [],
  };
}

/**
 * Buckets already-classified items into their one section each.
 *
 * Generic on purpose: this has no idea whether `T` is a Gmail message or a
 * test fixture. That is what keeps it testable with plain objects and keeps
 * classify.ts free of any Gmail-specific shape.
 */
export function groupClassifiedEmails<T extends CategorizedItem>(
  items: readonly T[]
): MorningBriefSections<T> {
  const sections = emptySections<T>();

  for (const item of items) {
    switch (item.category) {
      case "MONEY_AND_ACCOUNTS":
        sections.moneyAndAccounts.push(item);
        break;
      case "KURVZ_PROFORMANCE":
        sections.kurvzProformance.push(item);
        break;
      case "CAREER_AND_OPPORTUNITIES":
        sections.careerAndOpportunities.push(item);
        break;
      case "CAN_WAIT":
        sections.canWait.push(item);
        break;
      case "POTENTIAL_JUNK":
        sections.potentialJunk.push(item);
        break;
      case "UNSUBSCRIBE_CANDIDATE":
        sections.unsubscribeCandidates.push(item);
        break;
    }
  }

  return sections;
}

/**
 * Every item flagged `isActionToday`, across every section, in their original
 * relative order. This is the ONLY way the "Needs Action Today" rollup is
 * built — it is a view over the sections, never a second storage bucket, so
 * an item can never render twice.
 */
export function selectActionTodayItems<T extends CategorizedItem>(
  sections: MorningBriefSections<T>
): T[] {
  return [
    ...sections.moneyAndAccounts,
    ...sections.kurvzProformance,
    ...sections.careerAndOpportunities,
    ...sections.canWait,
    ...sections.potentialJunk,
    ...sections.unsubscribeCandidates,
  ].filter((item) => item.isActionToday);
}

export interface InboxSnapshot {
  actionTodayCount: number;
  moneyCount: number;
  businessCount: number;
  careerCount: number;
  canWaitCount: number;
  junkCount: number;
  unsubscribeCount: number;
}

/** Counts for the compact snapshot strip. Every count is a plain length —
 *  nothing here re-derives category membership, so it can never disagree
 *  with what the sections actually render. */
export function buildInboxSnapshot<T extends CategorizedItem>(
  sections: MorningBriefSections<T>
): InboxSnapshot {
  return {
    actionTodayCount: selectActionTodayItems(sections).length,
    moneyCount: sections.moneyAndAccounts.length,
    businessCount: sections.kurvzProformance.length,
    careerCount: sections.careerAndOpportunities.length,
    canWaitCount: sections.canWait.length,
    junkCount: sections.potentialJunk.length,
    unsubscribeCount: sections.unsubscribeCandidates.length,
  };
}

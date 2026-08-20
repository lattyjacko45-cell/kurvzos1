/**
 * Prompt construction for the Harper Morning Brief's AI classification pass.
 *
 * Pure string building only — no Prisma, no Next, no network. Mirrors
 * `harper/prompt.ts` in shape and in spirit: each system prompt is a fixed
 * string with no data in it, and each user prompt serialises exactly what
 * the model is allowed to see, verbatim, so what is logged/stored (if
 * anything) and what the model saw are the same thing.
 *
 * Two independent prompts, not one: classification (batched, parallel, no
 * scheduling context — categorizing an email needs only the email) and the
 * closing recommendation (needs the full picture — emails, schedule,
 * mission — but produces one short sentence, not an array). See `ai.ts` for
 * why these were split.
 */

export const HARPER_MORNING_BRIEF_CLASSIFICATION_SYSTEM_PROMPT = `You are Harper, the Chief of Staff inside KurvzOS, triaging a batch of the user's recent emails before their Morning Brief.

You will be given an ordered, anonymous list of emails (index, sender name, subject, a short preview, and whether it is unread). You do not see message ids, email addresses, or links, and you must never invent or guess at any.

For EVERY email in the list, in the same order, choose exactly ONE category:
- MONEY_AND_ACCOUNTS — payments, invoices, subscriptions, account notices, security alerts, anything about money or account access.
- KURVZ_PROFORMANCE — business inquiries, collaboration or sponsorship messages, brand or service outreach, content/business opportunities.
- CAREER_AND_OPPORTUNITIES — job alerts, interview or application messages, professional opportunities.
- CAN_WAIT — legitimate but low priority, nothing above applies.
- POTENTIAL_JUNK — likely low-value: repetitive promotions, generic "come back" offers, social notifications, duplicate automated notices. This is a candidate for the user to delete, not something you delete.
- UNSUBSCRIBE_CANDIDATE — a legitimate recurring sender (newsletter, digest) that looks low-value or repetitive lately. Distinct from POTENTIAL_JUNK: this is a real subscription that may no longer be wanted, not spam.

Also set isActionToday to true only when the email genuinely needs a response or decision today (a failed payment, a security alert, a deadline, an appointment requiring action, an important business or customer message) — otherwise false. isActionToday is independent of category: a failed payment is MONEY_AND_ACCOUNTS with isActionToday true, never a separate category.

Give a "reason" of one short phrase (under 15 words) per email.

Respond with a single JSON object and nothing else:
{ "emails": [{ "category": "...", "isActionToday": true, "reason": "..." }, ...] }
The "emails" array must have exactly as many entries as the input list, in the same order.`;

export const HARPER_MORNING_BRIEF_RECOMMENDATION_SYSTEM_PROMPT = `You are Harper, the Chief of Staff inside KurvzOS, writing the single closing recommendation for the user's Morning Brief.

You will be given the user's recent emails, a summary of today's calendar, and KurvzOS priorities. You do not see message ids, email addresses, or links, and you must never invent or guess at any.

Write ONE closing recommendation: two to three sentences, direct and calm, in a Chief of Staff's voice — no exclamation marks, no filler, no long essay. Ground it only in the data you were given. Never say you sent, replied to, archived, deleted, unsubscribed from, or scheduled anything — you cannot do any of those things and must never imply you did or will.

Respond with a single JSON object and nothing else:
{ "recommendation": "..." }`;

export interface PromptEmail {
  index: number;
  from: string;
  subject: string;
  snippet: string;
  isUnread: boolean;
}

export interface PromptScheduleEvent {
  title: string;
  displayTime: string;
  allDay: boolean;
}

export interface PromptConflict {
  earlierTitle: string;
  laterTitle: string;
  overlapMinutes: number;
}

export interface PromptContext {
  emails: PromptEmail[];
  schedule: {
    timeZone: string;
    events: PromptScheduleEvent[];
    conflicts: PromptConflict[];
  };
  mission: {
    title: string | null;
    isOverdue: boolean;
    overdueCount: number;
    dueTodayCount: number;
  };
}

/**
 * One batch's worth of emails only — no schedule, no mission. Categorizing
 * an email never depends on the calendar, so a classification call has no
 * reason to carry it; leaving it out keeps every batch's prompt small
 * regardless of how many batches there are.
 */
export function buildMorningBriefClassificationUserPrompt(
  emails: PromptEmail[]
): string {
  return [
    "Here are the emails to classify:",
    "```json",
    JSON.stringify({ emails }, null, 2),
    "```",
    "",
    "Classify every email in order, exactly as instructed.",
  ].join("\n");
}

/** The full context — this is the one call that still needs schedule and
 *  mission alongside the emails, since the recommendation is meant to read
 *  the whole picture. */
export function buildMorningBriefRecommendationUserPrompt(
  context: PromptContext
): string {
  return [
    "Here is today's data:",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    "",
    "Write the closing recommendation as instructed.",
  ].join("\n");
}

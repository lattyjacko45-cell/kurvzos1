/**
 * Classification of Gmail API failures.
 *
 * Dependency-free on purpose — no Prisma, no Next, no `@/` alias — so the
 * branch tests in `failure.test.mjs` can run it directly under Node's type
 * stripping, and so it is safe to import from a client component.
 *
 * This mirrors what the YouTube integration already does with
 * `classifyChannelFailure`: Google's raw reason strings are mapped onto a small
 * closed set. That matters twice over — the value is safe to put in a redirect
 * URL and a log because it can never carry an address, a token or free text,
 * and the UI can turn it into an instruction instead of a dead end.
 */

export type GmailFailureReason =
  | "gmail_api_disabled"
  | "no_gmail_mailbox"
  | "insufficient_permissions"
  | "auth_error"
  | "quota_exceeded"
  | "http_error"
  | "unexpected";

/** Google reasons we recognise, mapped onto our closed set. */
const KNOWN_GMAIL_REASONS: Record<string, GmailFailureReason> = {
  accessNotConfigured: "gmail_api_disabled",
  SERVICE_DISABLED: "gmail_api_disabled",

  // Gmail answers "this account has no mailbox" with failedPrecondition —
  // typical for a Workspace account with Gmail switched off, or an account
  // that has never provisioned Gmail.
  failedPrecondition: "no_gmail_mailbox",
  FAILED_PRECONDITION: "no_gmail_mailbox",

  insufficientPermissions: "insufficient_permissions",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: "insufficient_permissions",
  PERMISSION_DENIED: "insufficient_permissions",
  forbidden: "insufficient_permissions",

  authError: "auth_error",
  UNAUTHENTICATED: "auth_error",
  invalid_grant: "auth_error",

  quotaExceeded: "quota_exceeded",
  rateLimitExceeded: "quota_exceeded",
  userRateLimitExceeded: "quota_exceeded",
  dailyLimitExceeded: "quota_exceeded",
};

/**
 * Maps a Gmail failure onto the closed set.
 *
 * Google's own reason wins when we recognise it; otherwise the HTTP status
 * alone decides, because a 401 and a 403 still tell us something useful even
 * when the payload does not.
 */
export function classifyGmailFailure(
  status: number | undefined,
  googleReason: string | undefined
): GmailFailureReason {
  if (googleReason && KNOWN_GMAIL_REASONS[googleReason]) {
    return KNOWN_GMAIL_REASONS[googleReason];
  }

  if (status === 401) return "auth_error";
  if (status === 403) return "insufficient_permissions";
  if (status === 429) return "quota_exceeded";
  // 400 from users.getProfile is overwhelmingly the no-mailbox precondition.
  if (status === 400) return "no_gmail_mailbox";
  if (typeof status === "number") return "http_error";

  return "unexpected";
}

/** What the person should actually do about it. */
export const GMAIL_FAILURE_HINTS: Record<GmailFailureReason, string> = {
  gmail_api_disabled:
    "The Gmail API is not enabled on the Google Cloud project this OAuth client belongs to. Enable Gmail API in that project, then connect again.",
  no_gmail_mailbox:
    "Google reports no Gmail mailbox for the account you authorised. Pick an account that has Gmail — a Workspace account with Gmail switched off cannot be read.",
  insufficient_permissions:
    "The consent screen did not grant read-only Gmail access. Remove KurvzOS at myaccount.google.com/permissions, then connect again and accept the Gmail permission.",
  auth_error:
    "Google rejected the credential while reading the mailbox. Connect again to issue a fresh authorization.",
  quota_exceeded:
    "The project's Gmail API quota is exhausted. Wait for the daily reset or request more quota, then try again.",
  http_error:
    "The request to Gmail did not complete. Check network access to googleapis.com, then try again.",
  unexpected: "Google returned an unrecognised response for the Gmail lookup.",
};

/**
 * Type guard so a URL parameter can be trusted before it indexes the map.
 *
 * hasOwnProperty rather than `in`: `in` walks the prototype chain, so
 * `?reason=constructor` — an attacker-controlled query string — would pass the
 * guard and index Object.prototype.
 */
export function isGmailFailureReason(
  value: string | undefined
): value is GmailFailureReason {
  return Boolean(
    value && Object.prototype.hasOwnProperty.call(GMAIL_FAILURE_HINTS, value)
  );
}

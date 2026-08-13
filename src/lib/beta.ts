/**
 * Private beta presentation and support contact.
 *
 * Dependency-free — no Next, no `@/` alias — so the branch tests run directly
 * under Node's type stripping.
 *
 * Every function takes the raw environment value rather than reading
 * `process.env` itself. Two reasons: Next only inlines `NEXT_PUBLIC_*` when the
 * reference is written literally at the call site, and passing the value in is
 * what makes these testable at all.
 */

/**
 * Whether to show invite-only messaging.
 *
 * PRESENTATION ONLY. This is not an access control and must never be treated
 * as one — a `NEXT_PUBLIC_` value is compiled into the browser bundle and can
 * be edited by anyone with devtools. The real gate is Supabase's "Allow new
 * users to sign up" setting, which refuses the signup at the API regardless of
 * what this flag says.
 *
 * Its actual job is to let local development keep creating test accounts while
 * production shows invite-only copy.
 */
export function isPrivateBetaEnabled(raw: string | undefined): boolean {
  return raw === "true";
}

export const PRIVATE_BETA_LABEL = "Private Beta";

/** Simple structural check — enough to avoid rendering a broken mailto. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The configured support address, or null.
 *
 * Null is the important case: an unset variable must hide the support action
 * entirely rather than render "undefined" or a `mailto:` that goes nowhere.
 * A blank or malformed value is treated the same as absent.
 */
export function normalizeSupportEmail(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * A safe `mailto:` href.
 *
 * The subject is encoded, so a subject containing `&` or a newline cannot add
 * headers to the link. Nothing about the user is included — no id, no
 * workspace, no page — because a support link is not a telemetry channel.
 */
export function supportMailtoHref(email: string, subject?: string): string {
  const address = encodeURIComponent(email);

  return subject
    ? `mailto:${address}?subject=${encodeURIComponent(subject)}`
    : `mailto:${address}`;
}

/** Default subject lines, so support mail arrives pre-sorted. */
export const SUPPORT_SUBJECTS = {
  general: "KurvzOS support",
  signIn: "KurvzOS — trouble signing in",
} as const;

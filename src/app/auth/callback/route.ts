import { type EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { safeInternalRedirect } from "@/lib/security";
// Shared with the client fragment reader so both describe the same failure
// the same way.
import { noticeForProviderError } from "@/lib/auth-messages";
import { NextResponse } from "next/server";

/**
 * The single return point for every emailed auth link.
 *
 * Handles both shapes Supabase sends:
 *  - `code`       — the PKCE exchange, used by signup confirmation and
 *                   password recovery when the app uses @supabase/ssr.
 *  - `token_hash` + `type` — the verifyOtp shape, used by some email template
 *                   configurations. Supported so a project whose templates
 *                   have not been migrated still works.
 *
 * Nothing here is ever logged. A code, token hash or recovery token in a log
 * line is a working credential for whoever can read the log.
 */

function privateRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/** Only closed-set identifiers reach the URL — never a provider message. */
function failure(origin: string, notice: string): NextResponse {
  return privateRedirect(new URL(`/login?error=${notice}`, origin));
}

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function parseOtpType(value: string | null): EmailOtpType | null {
  if (!value) return null;
  return OTP_TYPES.includes(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  /**
   * `next` is validated against this origin. It is attacker-reachable — it
   * travels in an emailed link — so an unvalidated value here would be an open
   * redirect out of an email KurvzOS itself sent.
   */
  const next = safeInternalRedirect(searchParams.get("next"), origin);

  /**
   * Supabase reports a refused or expired link by redirecting here with an
   * error parameter rather than a code. Previously that fell through to the
   * generic failure, losing the reason — an expired reset link and a malformed
   * one produced identical, unhelpful copy.
   */
  const providerError =
    searchParams.get("error_code") ?? searchParams.get("error");
  if (providerError) {
    return failure(
      origin,
      noticeForProviderError(providerError, searchParams.get("error_description"))
    );
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = parseOtpType(searchParams.get("type"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) return privateRedirect(new URL(next, origin));

    // An already-used link is the common case: clicking a confirmation email
    // twice must not produce a stack trace or a blank page.
    return failure(origin, "link_expired");
  }

  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });

    if (!error) return privateRedirect(new URL(next, origin));

    return failure(origin, "link_expired");
  }

  // No code, no token — a hand-edited or truncated link.
  return failure(origin, "link_invalid");
}

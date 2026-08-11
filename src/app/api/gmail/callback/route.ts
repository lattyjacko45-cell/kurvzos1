import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, safeEquals } from "@/lib/crypto";
import {
  GmailApiError,
  exchangeGmailCode,
  fetchGmailProfile,
} from "@/lib/gmail/client";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  requireGmailEnv,
} from "@/lib/gmail/config";
import { classifyGmailFailure } from "@/lib/gmail/failure";
import { invalidateInbox } from "@/lib/gmail/read.server";

/**
 * GET /api/gmail/callback — completes the Gmail handshake.
 *
 * Per-stage isolation, same as the YouTube and Calendar callbacks. Nothing here
 * reads or writes YouTubeConnection or CalendarConnection, so a Gmail failure
 * cannot disturb either stored token.
 */

/**
 * `gmail_profile_lookup` is deliberately not called `profile_lookup`.
 *
 * The KurvzOS profile is resolved above via getCurrentUser + ensureProfile,
 * identically to the Calendar and YouTube callbacks, and it cannot fail into
 * this list. This stage is the *Gmail* mailbox lookup — a call to Google. The
 * shorter name read as "KurvzOS profile" and sent one investigation to
 * completely the wrong place.
 */
type CallbackStage =
  | "state_validation"
  | "token_exchange"
  | "missing_refresh_token"
  | "gmail_profile_lookup"
  | "token_encryption"
  | "database_save";

/** Stage, status and Google's short identifier only. Never a token or body. */
function logFailure(
  stage: CallbackStage,
  details: { status?: number; reason?: string } = {}
): void {
  console.error("[gmail] oauth callback failed", {
    stage,
    status: details.status ?? null,
    reason: details.reason ?? null,
    messageCount: 0,
  });
}

function privateRedirect(url: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let appUrl: string;
  try {
    appUrl = requireGmailEnv().appUrl;
  } catch {
    return NextResponse.json(
      { error: "Gmail integration is not configured." },
      { status: 503 }
    );
  }

  const inboxUrl = `${appUrl}/inbox`;

  /**
   * `reason` carries a value from the closed `GmailFailureReason` set only, the
   * same way the YouTube callback forwards its channel-lookup reason. It can
   * never contain an address, a token or Google's free text, so it is safe in a
   * URL — and it is what turns a dead-end "failed" into an instruction.
   */
  const fail = (status: string, stage?: CallbackStage, reason?: string) =>
    privateRedirect(
      `${inboxUrl}?gmail=${status}` +
        (stage ? `&stage=${stage}` : "") +
        (reason ? `&reason=${encodeURIComponent(reason)}` : "")
    );

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(GMAIL_OAUTH_STATE_COOKIE);

  if (oauthError) {
    logFailure("state_validation", { reason: oauthError });
    return fail("denied");
  }

  if (!code || !state || !expectedState || !safeEquals(state, expectedState)) {
    logFailure("state_validation", {
      reason: !code
        ? "missing_code"
        : !state
          ? "missing_state"
          : !expectedState
            ? "missing_state_cookie"
            : "state_mismatch",
    });
    return fail("invalid", "state_validation");
  }

  const user = await getCurrentUser();
  if (!user) {
    return privateRedirect(`${appUrl}/login`);
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  let tokens;
  try {
    tokens = await exchangeGmailCode(code);
  } catch (error) {
    logFailure("token_exchange", {
      status: error instanceof GmailApiError ? error.status : undefined,
      reason: error instanceof GmailApiError ? error.errorCode : "unexpected",
    });
    return fail("failed", "token_exchange");
  }

  // Google omits refresh_token when the app was already authorised. Reuse the
  // existing Gmail token if we hold one; never fall back to the YouTube or
  // Calendar token, whose grants may not include the Gmail scope.
  const existing = await prisma.gmailConnection.findUnique({
    where: { profileId: profile.id },
    select: { encryptedRefreshToken: true },
  });

  if (!tokens.refresh_token && !existing) {
    logFailure("missing_refresh_token");
    return fail("no_refresh_token", "missing_refresh_token");
  }

  // --- Stage: gmail_profile_lookup ----------------------------------------
  //
  // Reading the mailbox address. The access token is already proven good — the
  // exchange above succeeded — so a failure here is Google refusing this
  // specific API call, not a credential or a KurvzOS session problem. The
  // classified reason is forwarded so /inbox can say which of those it was.
  let gmailProfile;
  try {
    gmailProfile = await fetchGmailProfile(tokens.access_token);
  } catch (error) {
    const status = error instanceof GmailApiError ? error.status : undefined;
    const googleReason =
      error instanceof GmailApiError ? error.errorCode : undefined;
    const reason = classifyGmailFailure(status, googleReason);

    logFailure("gmail_profile_lookup", { status, reason });
    return fail("failed", "gmail_profile_lookup", reason);
  }

  let encryptedRefreshToken: string;
  try {
    encryptedRefreshToken = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : (existing?.encryptedRefreshToken as string);
  } catch (error) {
    logFailure("token_encryption", {
      reason: error instanceof Error ? error.name : "unexpected",
    });
    return fail("failed", "token_encryption");
  }

  try {
    await prisma.gmailConnection.upsert({
      where: { profileId: profile.id },
      update: {
        emailAddress: gmailProfile.emailAddress,
        encryptedRefreshToken,
        grantedScopes: tokens.scope ?? "",
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      },
      create: {
        profileId: profile.id,
        emailAddress: gmailProfile.emailAddress,
        encryptedRefreshToken,
        grantedScopes: tokens.scope ?? "",
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      },
    });
  } catch (error) {
    logFailure("database_save", {
      reason: error instanceof Error ? error.name : "unexpected",
    });
    return fail("failed", "database_save");
  }

  invalidateInbox(profile.id);

  return privateRedirect(`${inboxUrl}?gmail=connected`);
}

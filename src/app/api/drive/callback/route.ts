import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, safeEquals } from "@/lib/crypto";
import {
  DriveApiError,
  exchangeDriveCode,
  fetchDriveAccount,
} from "@/lib/drive/client";
import {
  DRIVE_OAUTH_STATE_COOKIE,
  requireDriveEnv,
} from "@/lib/drive/config";
import { classifyDriveFailure } from "@/lib/drive/failure";
import { invalidateDriveFiles } from "@/lib/drive/read.server";

/**
 * GET /api/drive/callback — completes the Drive handshake.
 *
 * Per-stage isolation, same as the other three Google callbacks. Nothing here
 * reads or writes YouTubeConnection, CalendarConnection or GmailConnection, so
 * a Drive failure cannot disturb any stored token.
 */

/**
 * `google_account_lookup` is named for what it actually is — a call to Google
 * for the account address — so it can never be misread as the KurvzOS profile
 * lookup, which happens earlier and cannot fail into this list.
 */
type CallbackStage =
  | "state_validation"
  | "token_exchange"
  | "missing_refresh_token"
  | "google_account_lookup"
  | "token_encryption"
  | "database_save";

/** Stage, status and a closed-set reason only. Never a token or body. */
function logFailure(
  stage: CallbackStage,
  details: { status?: number; reason?: string } = {}
): void {
  console.error("[drive] oauth callback failed", {
    stage,
    status: details.status ?? null,
    reason: details.reason ?? null,
    fileCount: 0,
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
    appUrl = requireDriveEnv().appUrl;
  } catch {
    return NextResponse.json(
      { error: "Drive integration is not configured." },
      { status: 503 }
    );
  }

  const driveUrl = `${appUrl}/drive`;

  /**
   * `reason` carries a value from the closed `DriveFailureReason` set only, the
   * same way the YouTube and Gmail callbacks forward theirs. It can never
   * contain a token, a filename or Google's free text.
   */
  const fail = (status: string, stage?: CallbackStage, reason?: string) =>
    privateRedirect(
      `${driveUrl}?drive=${status}` +
        (stage ? `&stage=${stage}` : "") +
        (reason ? `&reason=${encodeURIComponent(reason)}` : "")
    );

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(DRIVE_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(DRIVE_OAUTH_STATE_COOKIE);

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
    tokens = await exchangeDriveCode(code);
  } catch (error) {
    logFailure("token_exchange", {
      status: error instanceof DriveApiError ? error.status : undefined,
      reason: error instanceof DriveApiError ? error.errorCode : "unexpected",
    });
    return fail("failed", "token_exchange");
  }

  // Google omits refresh_token when the app was already authorised. Reuse the
  // existing Drive token if we hold one; never fall back to another
  // integration's token, whose grant may not include the Drive scope.
  const existing = await prisma.driveConnection.findUnique({
    where: { profileId: profile.id },
    select: { encryptedRefreshToken: true },
  });

  if (!tokens.refresh_token && !existing) {
    logFailure("missing_refresh_token");
    return fail("no_refresh_token", "missing_refresh_token");
  }

  let account;
  try {
    account = await fetchDriveAccount(tokens.access_token);
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : undefined;
    const googleReason =
      error instanceof DriveApiError ? error.errorCode : undefined;
    const reason = classifyDriveFailure(status, googleReason);

    logFailure("google_account_lookup", { status, reason });
    return fail("failed", "google_account_lookup", reason);
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
    await prisma.driveConnection.upsert({
      where: { profileId: profile.id },
      update: {
        accountEmail: account.accountEmail,
        encryptedRefreshToken,
        grantedScopes: tokens.scope ?? "",
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      },
      create: {
        profileId: profile.id,
        accountEmail: account.accountEmail,
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

  invalidateDriveFiles(profile.id);

  return privateRedirect(`${driveUrl}?drive=connected`);
}

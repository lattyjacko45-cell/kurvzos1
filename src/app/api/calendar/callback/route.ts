import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, safeEquals } from "@/lib/crypto";
import {
  CalendarApiError,
  exchangeCalendarCode,
  fetchPrimaryCalendarSummary,
} from "@/lib/calendar/client";
import {
  CALENDAR_OAUTH_STATE_COOKIE,
  requireCalendarEnv,
} from "@/lib/calendar/config";
import { invalidateSchedule } from "@/lib/calendar/read.server";

/**
 * GET /api/calendar/callback — completes the Calendar handshake.
 *
 * Per-stage isolation, same as the YouTube callback. Nothing here reads or
 * writes YouTubeConnection, so a Calendar failure cannot disturb YouTube's
 * stored token. (Google still holds one combined authorization for the
 * project — that is why neither disconnect revokes.)
 */

type CallbackStage =
  | "state_validation"
  | "token_exchange"
  | "missing_refresh_token"
  | "calendar_lookup"
  | "token_encryption"
  | "database_save";

/** Stage, status and Google's short identifier only. Never a token or body. */
function logFailure(
  stage: CallbackStage,
  details: { status?: number; reason?: string } = {}
): void {
  console.error("[calendar] oauth callback failed", {
    stage,
    status: details.status ?? null,
    reason: details.reason ?? null,
    eventCount: 0,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let appUrl: string;
  try {
    appUrl = requireCalendarEnv().appUrl;
  } catch {
    return NextResponse.json(
      { error: "Calendar integration is not configured." },
      { status: 503 }
    );
  }

  const settingsUrl = `${appUrl}/dashboard/settings`;
  const fail = (status: string, stage?: CallbackStage) =>
    NextResponse.redirect(
      `${settingsUrl}?calendar=${status}${stage ? `&stage=${stage}` : ""}`
    );

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(CALENDAR_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(CALENDAR_OAUTH_STATE_COOKIE);

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
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  let tokens;
  try {
    tokens = await exchangeCalendarCode(code);
  } catch (error) {
    logFailure("token_exchange", {
      status: error instanceof CalendarApiError ? error.status : undefined,
      reason:
        error instanceof CalendarApiError ? error.errorCode : "unexpected",
    });
    return fail("failed", "token_exchange");
  }

  // Google omits refresh_token when the app was already authorised. Reuse the
  // existing Calendar token if we hold one; never fall back to the YouTube
  // token, whose grant may not include Calendar scopes.
  const existing = await prisma.calendarConnection.findUnique({
    where: { profileId: profile.id },
    select: { encryptedRefreshToken: true },
  });

  if (!tokens.refresh_token && !existing) {
    logFailure("missing_refresh_token");
    return fail("no_refresh_token", "missing_refresh_token");
  }

  let summary;
  try {
    summary = await fetchPrimaryCalendarSummary(tokens.access_token);
  } catch (error) {
    logFailure("calendar_lookup", {
      status: error instanceof CalendarApiError ? error.status : undefined,
      reason:
        error instanceof CalendarApiError ? error.errorCode : "unexpected",
    });
    return fail("failed", "calendar_lookup");
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
    await prisma.calendarConnection.upsert({
      where: { profileId: profile.id },
      update: {
        calendarLabel: summary.label,
        calendarTimeZone: summary.timeZone,
        encryptedRefreshToken,
        grantedScopes: tokens.scope ?? "",
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      },
      create: {
        profileId: profile.id,
        calendarLabel: summary.label,
        calendarTimeZone: summary.timeZone,
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

  invalidateSchedule(profile.id);

  return NextResponse.redirect(`${settingsUrl}?calendar=connected`);
}

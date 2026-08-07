import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, safeEquals } from "@/lib/crypto";
import {
  YouTubeApiError,
  exchangeCodeForTokens,
  lookupOwnChannel,
} from "@/lib/youtube/client";
import {
  OAUTH_STATE_COOKIE,
  requireYouTubeEnv,
} from "@/lib/youtube/config";

/**
 * GET /api/youtube/callback — completes the OAuth handshake.
 *
 * Token exchange happens entirely server-side; the browser only ever sees a
 * redirect back to /content with a status flag and, on failure, the stage that
 * failed.
 *
 * Each step is isolated so a failure can be attributed precisely. Every
 * previous security property is unchanged: state is still compared in constant
 * time, the cookie is still single-use, and the refresh token is still
 * encrypted before it touches the database.
 */

/** Where in the handshake a failure occurred. Safe to put in a URL. */
type CallbackStage =
  | "state_validation"
  | "token_exchange"
  | "missing_refresh_token"
  | "channel_lookup"
  | "token_encryption"
  | "database_save"
  | "unexpected";

/**
 * Server-only diagnostics.
 *
 * Deliberately narrow: the stage, the HTTP status when there is one, and
 * Google's own short error identifier. Never the authorization code, access
 * token, refresh token, client secret, encryption key, or any response body.
 */
function logCallbackFailure(
  stage: CallbackStage,
  details: { status?: number; errorCode?: string } = {}
): void {
  console.error("[youtube] oauth callback failed", {
    stage,
    status: details.status ?? null,
    errorCode: details.errorCode ?? null,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  let appUrl: string;
  try {
    appUrl = requireYouTubeEnv().appUrl;
  } catch {
    return NextResponse.json(
      { error: "YouTube integration is not configured." },
      { status: 503 }
    );
  }

  const succeed = () =>
    NextResponse.redirect(`${appUrl}/content?youtube=connected`);

  const fail = (status: string, stage?: CallbackStage, reason?: string) =>
    NextResponse.redirect(
      `${appUrl}/content?youtube=${status}` +
        (stage ? `&stage=${stage}` : "") +
        // Only ever a value from a closed set defined in our own code.
        (reason ? `&reason=${encodeURIComponent(reason)}` : "")
    );

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  // Single-use regardless of outcome.
  cookieStore.delete(OAUTH_STATE_COOKIE);

  // --- Stage: state_validation -------------------------------------------
  if (oauthError) {
    // The user declined, or Google refused consent. Not a KurvzOS fault.
    logCallbackFailure("state_validation", { errorCode: oauthError });
    return fail("denied");
  }

  if (!code || !state || !expectedState || !safeEquals(state, expectedState)) {
    logCallbackFailure("state_validation", {
      errorCode: !code
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

  // --- Stage: token_exchange ---------------------------------------------
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (error) {
    logCallbackFailure("token_exchange", {
      status: error instanceof YouTubeApiError ? error.status : undefined,
      errorCode:
        error instanceof YouTubeApiError ? error.errorCode : undefined,
    });
    return fail("failed", "token_exchange");
  }

  // --- Stage: missing_refresh_token --------------------------------------
  // Google only returns a refresh token on first consent. Without one we
  // cannot act on the channel later, so this is a hard failure.
  if (!tokens.refresh_token) {
    logCallbackFailure("missing_refresh_token");
    return fail("no_refresh_token", "missing_refresh_token");
  }

  // --- Stage: channel_lookup ---------------------------------------------
  const lookup = await lookupOwnChannel(tokens.access_token);

  if (!lookup.ok || !lookup.channel) {
    // Dedicated log shape for this stage: status, the classified reason, and
    // how many channels came back. No channel id, title, email or token.
    console.error("[youtube] oauth callback failed", {
      stage: "channel_lookup",
      status: lookup.status,
      reason: lookup.reason,
      itemsCount: lookup.itemsCount,
    });

    // The reason comes from a closed set, so it is safe in a URL.
    return fail("failed", "channel_lookup", lookup.reason);
  }

  const channel = lookup.channel;

  // --- Stage: token_encryption -------------------------------------------
  let encryptedRefreshToken: string;
  try {
    encryptedRefreshToken = encryptSecret(tokens.refresh_token);
  } catch (error) {
    // Almost always a missing or wrong-length YOUTUBE_TOKEN_ENCRYPTION_KEY.
    logCallbackFailure("token_encryption", {
      errorCode: error instanceof Error ? error.name : undefined,
    });
    return fail("failed", "token_encryption");
  }

  // --- Stage: database_save ----------------------------------------------
  try {
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await prisma.youTubeConnection.upsert({
      where: { profileId: profile.id },
      update: {
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        encryptedRefreshToken,
        tokenExpiresAt,
      },
      create: {
        profileId: profile.id,
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        encryptedRefreshToken,
        tokenExpiresAt,
      },
    });
  } catch (error) {
    logCallbackFailure("database_save", {
      errorCode: error instanceof Error ? error.name : undefined,
    });
    return fail("failed", "database_save");
  }

  return succeed();
}

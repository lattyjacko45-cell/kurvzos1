import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, safeEquals } from "@/lib/crypto";
import { exchangeCodeForTokens, fetchOwnChannel } from "@/lib/youtube/client";
import {
  OAUTH_STATE_COOKIE,
  requireYouTubeEnv,
} from "@/lib/youtube/config";

/**
 * GET /api/youtube/callback — completes the OAuth handshake.
 *
 * Token exchange happens entirely server-side; the browser only ever sees a
 * redirect back to /content with a short status flag.
 */
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

  const back = (status: string) =>
    NextResponse.redirect(`${appUrl}/content?youtube=${status}`);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  if (oauthError) return back("denied");
  if (!code || !state || !expectedState) return back("invalid");
  if (!safeEquals(state, expectedState)) return back("invalid");

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Without a refresh token we cannot act on the channel later. Google only
    // returns one on first consent, which is why we always ask for it.
    if (!tokens.refresh_token) return back("no_refresh_token");

    const channel = await fetchOwnChannel(tokens.access_token);
    const encryptedRefreshToken = encryptSecret(tokens.refresh_token);
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

    return back("connected");
  } catch {
    // Never log the error object here — it can carry request parameters.
    return back("failed");
  }
}

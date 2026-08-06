import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { buildAuthorizationUrl } from "@/lib/youtube/client";
import {
  OAUTH_STATE_COOKIE,
  YouTubeNotConfiguredError,
} from "@/lib/youtube/config";

/**
 * GET /api/youtube/connect — starts the Google OAuth flow.
 *
 * CSRF protection: a random state value is stored in an httpOnly, SameSite=Lax
 * cookie and echoed by Google on the callback. The callback refuses to proceed
 * unless the two match.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensures the profile exists before we hand control to Google.
  await ensureProfile(user.id, user.email, user.fullName ?? undefined);

  try {
    const state = randomToken();
    const authorizationUrl = buildAuthorizationUrl(state);

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (err) {
    if (err instanceof YouTubeNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Could not start the YouTube connection." },
      { status: 500 }
    );
  }
}

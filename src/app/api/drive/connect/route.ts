import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { buildDriveAuthorizationUrl } from "@/lib/drive/client";
import {
  DRIVE_OAUTH_STATE_COOKIE,
  DriveNotConfiguredError,
} from "@/lib/drive/config";

/**
 * GET /api/drive/connect — starts the Google Drive OAuth flow.
 *
 * Its own state cookie, callback and scope, but the same Google Cloud client as
 * YouTube, Calendar and Gmail. `include_granted_scopes=true` means this consent
 * adds Drive access alongside the existing grants rather than replacing them,
 * so connecting Drive cannot disturb the other three integrations.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureProfile(user.id, user.email, user.fullName ?? undefined);

  try {
    const state = randomToken();
    const authorizationUrl = buildDriveAuthorizationUrl(state);

    const cookieStore = await cookies();
    cookieStore.set(DRIVE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    const response = NextResponse.redirect(authorizationUrl);
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (err) {
    if (err instanceof DriveNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Could not start the Drive connection." },
      { status: 500 }
    );
  }
}

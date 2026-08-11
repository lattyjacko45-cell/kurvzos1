import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { buildGmailAuthorizationUrl } from "@/lib/gmail/client";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  GmailNotConfiguredError,
} from "@/lib/gmail/config";

/**
 * GET /api/gmail/connect — starts the Gmail OAuth flow.
 *
 * Its own state cookie, callback and scope, but the same Google Cloud client as
 * YouTube and Calendar. `include_granted_scopes=true` means this consent adds
 * Gmail access alongside the existing grants rather than replacing them, so
 * connecting Gmail cannot disturb either of the other two integrations.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureProfile(user.id, user.email, user.fullName ?? undefined);

  try {
    const state = randomToken();
    const authorizationUrl = buildGmailAuthorizationUrl(state);

    const cookieStore = await cookies();
    cookieStore.set(GMAIL_OAUTH_STATE_COOKIE, state, {
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
    if (err instanceof GmailNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Could not start the Gmail connection." },
      { status: 500 }
    );
  }
}

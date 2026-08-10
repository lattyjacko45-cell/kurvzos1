import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { buildCalendarAuthorizationUrl } from "@/lib/calendar/client";
import {
  CALENDAR_OAUTH_STATE_COOKIE,
  CalendarNotConfiguredError,
} from "@/lib/calendar/config";

/**
 * GET /api/calendar/connect — starts the Google Calendar OAuth flow.
 *
 * Independent of the YouTube flow: its own state cookie, its own callback, its
 * own scope. `include_granted_scopes=true` means this consent adds Calendar
 * access alongside any YouTube grant rather than replacing it.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureProfile(user.id, user.email, user.fullName ?? undefined);

  try {
    const state = randomToken();
    const authorizationUrl = buildCalendarAuthorizationUrl(state);

    const cookieStore = await cookies();
    cookieStore.set(CALENDAR_OAUTH_STATE_COOKIE, state, {
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
    if (err instanceof CalendarNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Could not start the calendar connection." },
      { status: 500 }
    );
  }
}

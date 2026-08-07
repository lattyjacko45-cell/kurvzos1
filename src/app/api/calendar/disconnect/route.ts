import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateSchedule } from "@/lib/calendar/read.server";

/**
 * POST /api/calendar/disconnect — LOCAL ONLY.
 *
 * This deliberately does NOT call Google's revocation endpoint.
 *
 * Calendar and YouTube are authorised through the same Google Cloud project
 * with `include_granted_scopes=true`, which Google treats as one combined
 * authorization. Revoking a token there removes every scope the project holds
 * — so revoking on Calendar disconnect would silently break the YouTube
 * connection as well.
 *
 * Disconnecting here therefore means "stop KurvzOS using Calendar": the stored
 * refresh token is deleted and the cache dropped, but the grant at Google
 * remains. Full provider-side revocation belongs in a separate, explicit
 * "Disconnect Google from KurvzOS" action that warns it affects both.
 *
 * Touches only calendar_connections. YouTubeConnection, its refresh token and
 * all YouTube data are untouched.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  // deleteMany rather than delete: disconnecting when nothing is connected is
  // a no-op, not an error.
  await prisma.calendarConnection.deleteMany({
    where: { profileId: profile.id },
  });

  invalidateSchedule(profile.id);

  return NextResponse.json({ success: true });
}

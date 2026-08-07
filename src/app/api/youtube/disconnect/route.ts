import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/youtube/disconnect — LOCAL ONLY.
 *
 * Previously this revoked the refresh token at Google. That was safe while
 * YouTube was the only Google integration; it is not safe now. Calendar is
 * authorised through the same Google Cloud project with
 * `include_granted_scopes=true`, which Google treats as one combined
 * authorization — revoking here would drop the Calendar scopes too and
 * silently break that connection.
 *
 * Disconnecting means "stop KurvzOS using YouTube": the stored refresh token
 * is deleted and the connection removed, but the grant at Google remains.
 * Provider-side revocation belongs in a separate explicit "Disconnect Google
 * from KurvzOS" action that warns it affects both integrations.
 *
 * Touches only youtube_connections. CalendarConnection is untouched.
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

  await prisma.youTubeConnection.deleteMany({
    where: { profileId: profile.id },
  });

  return NextResponse.json({ success: true });
}

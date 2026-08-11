import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateInbox } from "@/lib/gmail/read.server";

/**
 * POST /api/gmail/disconnect — LOCAL ONLY.
 *
 * This deliberately does NOT call Google's revocation endpoint, for the same
 * reason the Calendar disconnect does not: Gmail, Calendar and YouTube are
 * authorised through one Google Cloud project with include_granted_scopes=true,
 * which Google treats as a single combined authorization. Revoking here would
 * silently break the other two integrations.
 *
 * Disconnecting means "stop KurvzOS reading this mailbox": the stored refresh
 * token is deleted and the cache dropped, but the grant at Google remains. Full
 * provider-side revocation belongs in a separate, explicit action that warns it
 * affects all three.
 *
 * Touches only gmail_connections. YouTubeConnection, CalendarConnection, their
 * refresh tokens and all their data are untouched.
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
  await prisma.gmailConnection.deleteMany({
    where: { profileId: profile.id },
  });

  invalidateInbox(profile.id);

  return NextResponse.json({ success: true });
}

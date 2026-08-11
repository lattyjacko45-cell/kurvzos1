import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDriveFiles } from "@/lib/drive/read.server";

/**
 * POST /api/drive/disconnect — LOCAL ONLY.
 *
 * This deliberately does NOT call Google's revocation endpoint, for the same
 * reason the Calendar and Gmail disconnects do not: Drive, Gmail, Calendar and
 * YouTube are authorised through one Google Cloud project with
 * include_granted_scopes=true, which Google treats as a single combined
 * authorization. Revoking here would silently break the other three.
 *
 * Disconnecting means "stop KurvzOS reading this Drive": the stored refresh
 * token is deleted and the cache dropped, but the grant at Google remains. Full
 * provider-side revocation belongs in a separate, explicit action that warns it
 * affects all four.
 *
 * Scoped to the authenticated profile only, and touches only
 * drive_connections. No other integration's row or token is read or written.
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
  await prisma.driveConnection.deleteMany({
    where: { profileId: profile.id },
  });

  invalidateDriveFiles(profile.id);

  return NextResponse.json({ success: true });
}

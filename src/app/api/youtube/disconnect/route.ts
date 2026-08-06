import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { revokeRefreshToken } from "@/lib/youtube/client";

/** POST /api/youtube/disconnect — revokes at Google, then deletes locally. */
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

  const connection = await prisma.youTubeConnection.findUnique({
    where: { profileId: profile.id },
    select: { encryptedRefreshToken: true },
  });

  if (!connection) {
    return NextResponse.json({ success: true });
  }

  try {
    await revokeRefreshToken(decryptSecret(connection.encryptedRefreshToken));
  } catch {
    // Best effort: a revocation failure must not block local removal.
  }

  await prisma.youTubeConnection.delete({ where: { profileId: profile.id } });

  return NextResponse.json({ success: true });
}

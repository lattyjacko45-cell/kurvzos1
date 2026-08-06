import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Server-side helpers shared by every content route.
 *
 * Ownership rule: a content item belongs to the profile that created it, and
 * every handler resolves it through `findOwnedContent` — there is no code path
 * that loads a content item by id alone.
 */

export async function requireProfileId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  return profile.id;
}

export function findOwnedContent(contentId: string, profileId: string) {
  return prisma.contentItem.findFirst({
    where: { id: contentId, profileId },
  });
}

/** Confirms a task is inside a workspace the profile belongs to. */
export async function assertTaskAccess(
  taskId: string,
  profileId: string
): Promise<{ id: string; projectId: string } | null> {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      project: { workspace: { members: { some: { profileId } } } },
    },
    select: { id: true, projectId: true },
  });
}

export async function assertProjectAccess(
  projectId: string,
  profileId: string
): Promise<{ id: string } | null> {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: { members: { some: { profileId } } },
    },
    select: { id: true },
  });
}

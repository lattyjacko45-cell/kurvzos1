import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORKSPACE_NAME,
  isUniqueConstraintError,
  workspaceSlugForProfile,
} from "@/lib/provisioning";
import type { AuthUser } from "@/types";

const getProfileByUserId = cache((userId: string) =>
  prisma.profile.findUnique({ where: { userId } })
);

async function loadCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await getProfileByUserId(user.id);

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? "",
    fullName: profile?.fullName ?? user.user_metadata?.full_name ?? null,
    avatarUrl: profile?.avatarUrl ?? user.user_metadata?.avatar_url ?? null,
  };
}

/** Layouts and pages often ask for the same user during one server render. */
export const getCurrentUser = cache(loadCurrentUser);

async function loadProfile(
  userId: string,
  email: string,
  fullName?: string
) {
  const existing = await getProfileByUserId(userId);

  // The normal path is read-only. Previously every page and API request wrote
  // the same profile values back to the database even when nothing changed.
  if (
    existing &&
    existing.email === email &&
    existing.fullName === (fullName ?? null)
  ) {
    return existing;
  }

  return prisma.profile.upsert({
    where: { userId },
    update: { email, fullName },
    create: { userId, email, fullName },
  });
}

export const ensureProfile = cache(loadProfile);

function findExistingWorkspace(profileId: string) {
  return prisma.workspaceMember.findFirst({
    where: { profileId },
    include: { workspace: true },
    // Oldest membership wins, so the answer is stable for the life of the
    // account even if a second workspace is ever added.
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Returns the profile's workspace, creating it on first login.
 *
 * This is idempotent and safe under concurrency, which the previous version
 * was not. It read, saw nothing, and created — with no protection between the
 * two. A first login fans out into several server components at once (layout,
 * dashboard page, executive contexts), and React's `cache` only dedupes within
 * a single render, so those requests genuinely raced.
 *
 * Two outcomes were possible, both bad:
 *  - The old slug was `profileId.slice(0, 8)`, so concurrent creates collided
 *    on the unique index and the loser threw an unhandled P2002 — a 500 on the
 *    very first page a new user ever sees.
 *  - Had the slug been random instead, they would have succeeded separately
 *    and left the user with two workspaces and their data split across both.
 *
 * The fix keeps the deterministic slug — so exactly one insert can ever win —
 * and treats losing the race as the expected path: catch the unique violation,
 * re-read, and return the workspace the winner just created. One workspace,
 * one OWNER membership, no error, whatever the request ordering.
 *
 * The nested `members.create` means the workspace and its OWNER row are
 * written in a single statement, so a membership can never be orphaned.
 */
async function loadUserWorkspace(profileId: string) {
  const existing = await findExistingWorkspace(profileId);
  if (existing) return existing.workspace;

  try {
    return await prisma.workspace.create({
      data: {
        name: DEFAULT_WORKSPACE_NAME,
        slug: workspaceSlugForProfile(profileId),
        members: {
          create: {
            profileId,
            role: "OWNER",
          },
        },
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // A concurrent request won. Its workspace is the right one.
    const raced = await findExistingWorkspace(profileId);
    if (raced) return raced.workspace;

    // The slug is taken but this profile has no membership. That is not a
    // race, so it must not be swallowed.
    throw error;
  }
}

/** The dashboard layout and page share this lookup in the same render. */
export const getUserWorkspace = cache(loadUserWorkspace);

export async function getDashboardStats(workspaceId: string) {
  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({ where: { workspaceId } }),
    prisma.task.findMany({
      where: { project: { workspaceId } },
    }),
  ]);

  return {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t) => t.status === "DONE").length,
    inProgressTasks: tasks.filter((t) => t.status === "IN_PROGRESS").length,
  };
}

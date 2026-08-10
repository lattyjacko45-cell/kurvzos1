import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
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

async function loadUserWorkspace(profileId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { profileId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (membership) return membership.workspace;

  const slug = `workspace-${profileId.slice(0, 8)}`;
  return prisma.workspace.create({
    data: {
      name: "My Workspace",
      slug,
      members: {
        create: {
          profileId,
          role: "OWNER",
        },
      },
    },
  });
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

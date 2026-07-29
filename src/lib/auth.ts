import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
  });

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? "",
    fullName: profile?.fullName ?? user.user_metadata?.full_name ?? null,
    avatarUrl: profile?.avatarUrl ?? user.user_metadata?.avatar_url ?? null,
  };
}

export async function ensureProfile(userId: string, email: string, fullName?: string) {
  return prisma.profile.upsert({
    where: { userId },
    update: { email, fullName },
    create: { userId, email, fullName },
  });
}

export async function getUserWorkspace(profileId: string) {
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

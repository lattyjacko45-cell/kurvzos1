import type { Metadata } from "next";

import {
  getCurrentUser,
  ensureProfile,
  getUserWorkspace,
  getDashboardStats,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatsCards, ProjectList, TaskList } from "@/components/dashboard/stats-cards";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);

  const [stats, projects, tasks] = await Promise.all([
    getDashboardStats(workspace.id),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { tasks: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.task.findMany({
      where: { project: { workspaceId: workspace.id } },
      include: { project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening in your workspace today.
        </p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectList projects={projects} />
        <TaskList tasks={tasks} />
      </div>
    </div>
  );
}

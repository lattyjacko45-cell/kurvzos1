import type { Metadata } from "next";
import { Suspense } from "react";

import {
  getCurrentUser,
  ensureProfile,
  getUserWorkspace,
  getDashboardStats,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatsCards, ProjectList, TaskList } from "@/components/dashboard/stats-cards";
import { MissionSection } from "@/components/dashboard/mission-section";
import { FocusSessionToast } from "@/components/dashboard/focus-session-toast";
import { DailyBriefingSection } from "@/components/dashboard/daily-briefing";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getHarperView } from "@/lib/harper/view.server";
import { getReneeView } from "@/lib/renee/view.server";
import { getSophiaView } from "@/lib/sophia/view.server";
import { ExecutiveSummary } from "@/components/dashboard/executive-summary";

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

  const [
    stats,
    briefing,
    harperView,
    reneeView,
    sophiaView,
    projects,
    tasks,
  ] = await Promise.all([
      getDashboardStats(workspace.id),
      getDailyBriefing(workspace.id),
      // No view calls the model: each returns saved advice only while it still
      // matches the live context, otherwise a deterministic read.
      getHarperView(profile.id, workspace.id),
      getReneeView(profile.id, workspace.id),
      getSophiaView(profile.id, workspace.id),
      prisma.project.findMany({
        where: { workspaceId: workspace.id },
        include: { _count: { select: { tasks: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      // Recent Tasks shows active work only; completed tasks live on the
      // Completed tab and keep their history there.
      prisma.task.findMany({
        where: {
          project: { workspaceId: workspace.id },
          status: { not: "DONE" },
        },
        include: {
          project: { select: { name: true } },
          steps: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

  // Single source of truth for "what am I working on": the Daily Briefing
  // selector. It already excludes DONE tasks and applies the ranking rules.
  const missionTask = briefing.mission;
  const firstName = user.fullName ? user.fullName.split(" ")[0] : null;

  const harperAdvice = {
    currentPriority: harperView.advice.currentPriority,
    nextMove: harperView.advice.nextMove,
  };

  return (
    <div className="space-y-10">
      <Suspense fallback={null}>
        <FocusSessionToast />
      </Suspense>

      <section className="rounded-3xl border bg-gradient-to-br from-background via-background to-muted/40 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Mission Control
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Welcome back
            {firstName ? `, ${firstName}` : ""}
          </h1>

          <p className="max-w-2xl text-muted-foreground">
            Focus on the work that moves KurvzOS forward today.
          </p>
        </div>
      </section>

      <DailyBriefingSection briefing={briefing} firstName={firstName} />

      <ExecutiveSummary
        harperNextMove={harperView.advice.nextMove}
        reneeStrategicPriority={reneeView.advice.strategicPriority}
        sophiaMarketingPriority={sophiaView.advice.marketingPriority}
      />

      <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <MissionSection
          mission={
            missionTask
              ? {
                  id: missionTask.id,
                  title: missionTask.title,
                  projectName: missionTask.projectName,
                  status: missionTask.status,
                  priority: missionTask.priority,
                }
              : null
          }
          initialSteps={missionTask?.steps ?? []}
          firstName={firstName}
          greeting={briefing.greeting}
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
          }))}
          harper={harperAdvice}
        />
      </section>

      <StatsCards stats={stats} />

      <section className="grid gap-6 lg:grid-cols-2">
        <ProjectList projects={projects} />
        <TaskList tasks={tasks} />
      </section>
    </div>
  );
}

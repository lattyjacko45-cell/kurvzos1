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
import { CreateTaskDialog } from "@/components/dashboard/create-dialogs";
import { FocusSessionToast } from "@/components/dashboard/focus-session-toast";
import { DailyBriefingSection } from "@/components/dashboard/daily-briefing";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getHarperView } from "@/lib/harper/view.server";
import { getReneeView } from "@/lib/renee/view.server";
import { getSophiaView } from "@/lib/sophia/view.server";
import { getOliviaView } from "@/lib/olivia/view.server";
import { getMarcusView } from "@/lib/marcus/view.server";
import { getScheduleForProfile } from "@/lib/calendar/read.server";
import { TodaySchedule } from "@/components/dashboard/today-schedule";
import { ExecutiveSummary } from "@/components/dashboard/executive-summary";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface DashboardProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  _count: { tasks: number };
}

function SectionFallback({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="rounded-2xl border bg-card p-6">
      <Skeleton className="h-3 w-32" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton
            key={index}
            className={index === rows - 1 ? "h-10 w-2/3" : "h-4 w-full"}
          />
        ))}
      </div>
    </div>
  );
}

function ExecutiveSummaryFallback() {
  return (
    <section aria-busy="true">
      <Skeleton className="h-3 w-28" />
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="rounded-2xl border bg-card p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-28" />
            <Skeleton className="mt-4 h-14 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

async function DashboardSchedule({
  profileId,
  now,
}: {
  profileId: string;
  now: Date;
}) {
  const calendar = await getScheduleForProfile(profileId, now);
  return <TodaySchedule state={calendar.state} schedule={calendar.schedule} />;
}

async function DashboardExecutiveSummary({
  profileId,
  workspaceId,
  now,
}: {
  profileId: string;
  workspaceId: string;
  now: Date;
}) {
  const [harperView, reneeView, sophiaView, oliviaView, marcusView] =
    await Promise.all([
      getHarperView(profileId, workspaceId, now),
      getReneeView(profileId, workspaceId, now),
      getSophiaView(profileId, workspaceId, now),
      getOliviaView(profileId, workspaceId, now),
      getMarcusView(profileId, workspaceId, now),
    ]);

  return (
    <ExecutiveSummary
      harperNextMove={harperView.advice.nextMove}
      reneeStrategicPriority={reneeView.advice.strategicPriority}
      sophiaMarketingPriority={sophiaView.advice.marketingPriority}
      oliviaOperationsPriority={oliviaView.advice.operationsPriority}
      marcusFinancialPriority={marcusView.advice.financialPriority}
    />
  );
}

async function DashboardSupportingData({
  workspaceId,
  projects,
}: {
  workspaceId: string;
  projects: DashboardProject[];
}) {
  const [stats, tasks] = await Promise.all([
    getDashboardStats(workspaceId),
    prisma.task.findMany({
      where: {
        project: { workspaceId },
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

  return (
    <>
      <StatsCards stats={stats} />

      <section className="grid gap-6 lg:grid-cols-2">
        <ProjectList projects={projects} />
        <TaskList tasks={tasks} />
      </section>
    </>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);
  // One shared instant gives every executive the same view of "now" and lets
  // request-scoped caches collapse their repeated briefing, packet and
  // calendar reads into one operation apiece.
  const now = new Date();

  // Only the data needed for the primary decision zone blocks its render.
  // Calendar, executive contexts, metrics and recent lists stream below it.
  const [briefing, projects] = await Promise.all([
    getDailyBriefing(workspace.id, now),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      include: { _count: { select: { tasks: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  // Single source of truth for "what am I working on": the Daily Briefing
  // selector. It already excludes DONE tasks and applies the ranking rules.
  const missionTask = briefing.mission;
  const firstName = user.fullName ? user.fullName.split(" ")[0] : null;

  return (
    <div className="mx-auto w-full max-w-page space-y-8">
      <Suspense fallback={null}>
        <FocusSessionToast />
      </Suspense>

      {/*
        1. HEADER — compact on purpose.

        This was a p-8 panel with a display-lg title, which pushed the first
        actionable pixel most of a viewport down the page. Same content, same
        display serif, roughly half the height.
      */}
      <section className="rounded-2xl border bg-gradient-to-br from-background via-background to-muted/40 px-6 py-5">
        <SectionLabel>
          Mission Control
        </SectionLabel>

        <h1 className="mt-2 font-serif text-display-md">
          Welcome back
          {firstName ? `, ${firstName}` : ""}
        </h1>

        <p className="mt-1 max-w-2xl text-caption text-muted-foreground">
          Focus on the work that moves KurvzOS forward today.
        </p>
      </section>

      {/*
        2. PRIMARY ACTION ZONE — the one dominant thing on the page.

        Dominant cell is the mission when one exists, and the Daily Briefing
        when one does not; Harper supports from the narrow column in both
        cases. `items-start` is what keeps Harper content-height instead of
        stretching to match a tall mission card.
      */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {missionTask ? null : (
          <DailyBriefingSection
            briefing={briefing}
            firstName={firstName}
            emphasis="primary"
            action={
              <CreateTaskDialog
                projects={projects.map((project) => ({
                  id: project.id,
                  name: project.name,
                }))}
                triggerLabel="Create Task"
              />
            }
          />
        )}

        {/* The card already has a truthful deterministic recommendation
            derived from the live checklist. Saved executive advice streams
            in the full team section without delaying this primary action. */}
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
          harper={null}
        />
      </section>

      {/*
        3. SECONDARY INFORMATION, in decision order.

        The briefing recaps counts the mission card does not carry (overdue,
        due today), so it stays — but only when a mission already owns the
        zone above. When it IS the zone above, repeating it here would be the
        same card twice.
      */}
      {missionTask ? (
        <DailyBriefingSection briefing={briefing} firstName={firstName} />
      ) : null}

      <Suspense fallback={<SectionFallback />}>
        <DashboardSchedule profileId={profile.id} now={now} />
      </Suspense>

      <Suspense fallback={<ExecutiveSummaryFallback />}>
        <DashboardExecutiveSummary
          profileId={profile.id}
          workspaceId={workspace.id}
          now={now}
        />
      </Suspense>

      <Suspense fallback={<SectionFallback rows={3} />}>
        <DashboardSupportingData
          workspaceId={workspace.id}
          projects={projects}
        />
      </Suspense>
    </div>
  );
}

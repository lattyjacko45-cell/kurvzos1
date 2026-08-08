import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import {
  NewContentForm,
  type SelectableTask,
} from "@/components/content/new-content-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "New Content",
};

interface NewContentPageProps {
  searchParams: Promise<{ taskId?: string }>;
}

export default async function NewContentPage({
  searchParams,
}: NewContentPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);
  const { taskId } = await searchParams;

  const [tasks, briefing] = await Promise.all([
    prisma.task.findMany({
      where: { project: { workspaceId: workspace.id }, status: { not: "DONE" } },
      include: { project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    getDailyBriefing(workspace.id),
  ]);

  const selectableTasks: SelectableTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    projectName: task.project.name,
  }));

  // Only honour a task id this workspace actually owns.
  const validInitialTaskId =
    taskId && selectableTasks.some((task) => task.id === taskId)
      ? taskId
      : null;

  return (
    <div className="mx-auto w-full max-w-focused space-y-8">
      <PageHeader
        eyebrow="Content Studio"
        title="New content"
      />

      {/*
        The form is the entire purpose of this route, so it now sits on a card
        rather than floating on the page background. Nothing inside the form
        changed — same fields, labels, options, defaults, validation and
        actions; it simply reads as the primary surface at the focused width.
      */}
      <section className="rounded-2xl border bg-card p-8">
        <NewContentForm
          tasks={selectableTasks}
          initialTaskId={validInitialTaskId}
          missionTaskId={briefing.mission?.id ?? null}
        />
      </section>

      <p className="text-sm">
        <Link href="/content" className="underline underline-offset-4">
          Back to Content
        </Link>
      </p>
    </div>
  );
}

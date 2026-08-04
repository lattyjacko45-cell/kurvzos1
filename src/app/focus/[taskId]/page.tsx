import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FocusMode } from "@/components/focus/focus-mode";
import type { FocusSessionDto } from "@/lib/focus";

export const metadata: Metadata = {
  title: "Focus Mode",
};

interface FocusPageProps {
  params: Promise<{ taskId: string }>;
}

export default async function FocusPage({ params }: FocusPageProps) {
  const { taskId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        workspace: { members: { some: { profileId: profile.id } } },
      },
    },
    include: {
      project: { select: { name: true } },
      steps: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!task) {
    notFound();
  }

  // Recover the timer instead of starting a new one on refresh.
  const openSession = await prisma.focusSession.findFirst({
    where: {
      profileId: profile.id,
      taskId: task.id,
      status: { in: ["ACTIVE", "PAUSED"] },
    },
    orderBy: { createdAt: "desc" },
  });

  const initialSession: FocusSessionDto | null = openSession
    ? {
        id: openSession.id,
        taskId: openSession.taskId,
        status: openSession.status,
        startedAt: openSession.startedAt.toISOString(),
        endedAt: openSession.endedAt ? openSession.endedAt.toISOString() : null,
        lastResumedAt: openSession.lastResumedAt
          ? openSession.lastResumedAt.toISOString()
          : null,
        elapsedSeconds: openSession.elapsedSeconds,
        durationMinutes: openSession.durationMinutes,
      }
    : null;

  return (
    <FocusMode
      mission={{
        id: task.id,
        title: task.title,
        projectName: task.project.name,
        status: task.status,
      }}
      initialSteps={task.steps.map((step) => ({
        id: step.id,
        title: step.title,
        completed: step.completed,
        position: step.position,
      }))}
      initialSession={initialSession}
    />
  );
}

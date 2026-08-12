import type { Metadata } from "next";
import Link from "next/link";

import {
  getCurrentUser,
  ensureProfile,
  getUserWorkspace,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateTaskDialog } from "@/components/dashboard/create-dialogs";
import { isFromOnboarding } from "@/lib/provisioning";
import {
  CompletedTaskRow,
  type CompletedTaskRowData,
} from "@/components/dashboard/completed-task-row";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TaskStatusSelect,
  type TaskStatus,
} from "@/components/dashboard/task-status-select";

export const metadata: Metadata = {
  title: "Tasks",
};

/** Everything that is not DONE is active work. */
const ACTIVE_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW"] as const;

const priorityVariants: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "outline",
  URGENT: "destructive",
};

interface TasksPageProps {
  searchParams: Promise<{ tab?: string; from?: string }>;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);

  const { tab, from } = await searchParams;
  const activeTab = tab === "completed" ? "completed" : "active";
  const fromOnboarding = isFromOnboarding(from);

  const [activeTasks, completedTasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: {
        project: { workspaceId: workspace.id },
        status: { in: [...ACTIVE_STATUSES] },
      },
      include: { project: { select: { name: true } } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.task.findMany({
      where: { project: { workspaceId: workspace.id }, status: "DONE" },
      include: {
        project: { select: { name: true } },
        steps: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, completed: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true },
    }),
  ]);

  const completedRows: CompletedTaskRowData[] = completedTasks.map((task) => ({
    id: task.id,
    title: task.title,
    projectName: task.project.name,
    priority: task.priority,
    completedSteps: task.steps.filter((step) => step.completed).length,
    totalSteps: task.steps.length,
    // No completedAt column exists; updatedAt is the closest real signal.
    completedAt: task.updatedAt.toISOString(),
    steps: task.steps,
  }));

  const tabClass = (isCurrent: boolean) =>
    `rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
      isCurrent
        ? "bg-primary text-primary-foreground"
        : "bg-background hover:bg-muted"
    }`;

  return (
    <div className="mx-auto w-full max-w-page space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-display-lg">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage work across all projects.
          </p>
        </div>
        <CreateTaskDialog
          projects={projects}
          returnToDashboard={fromOnboarding}
        />
      </div>

      {/* Link-driven tabs so the Completed stat on the dashboard can deep-link. */}
      <nav aria-label="Task views" className="flex gap-2">
        <Link
          href="/dashboard/tasks"
          aria-current={activeTab === "active" ? "page" : undefined}
          className={tabClass(activeTab === "active")}
        >
          Active ({activeTasks.length})
        </Link>

        <Link
          href="/dashboard/tasks?tab=completed"
          aria-current={activeTab === "completed" ? "page" : undefined}
          className={tabClass(activeTab === "completed")}
        >
          Completed ({completedRows.length})
        </Link>
      </nav>

      {activeTab === "active" ? (
        activeTasks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No active tasks</CardTitle>
              <CardDescription>
                {projects.length === 0
                  ? "Create a project first, then add tasks to it."
                  : "Everything is done. Add a task or reopen one from Completed."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {activeTasks.map((task) => (
              <Card key={task.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {task.project.name}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={priorityVariants[task.priority]}>
                      {task.priority.toLowerCase()}
                    </Badge>

                    <TaskStatusSelect
                      taskId={task.id}
                      status={task.status as TaskStatus}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : completedRows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No completed work yet</CardTitle>
            <CardDescription>
              Finished tasks move here and keep their checklist history.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {completedRows.map((task) => (
            <CompletedTaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}


import type { Metadata } from "next";

import {
  getCurrentUser,
  ensureProfile,
  getUserWorkspace,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateTaskDialog } from "@/components/dashboard/create-dialogs";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TaskStatusSelect,
  type TaskStatus,
} from "@/components/dashboard/task-status-select";
export const metadata: Metadata = {
  title: "Tasks",
};

const statusLabels: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  DONE: "Done",
};

const priorityVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "outline",
  URGENT: "destructive",
};

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { project: { workspaceId: workspace.id } },
      include: { project: { select: { name: true } } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true },
    }),
  ]);

  const grouped = {
    TODO: tasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS"),
    REVIEW: tasks.filter((t) => t.status === "REVIEW"),
    DONE: tasks.filter((t) => t.status === "DONE"),
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage work across all projects.
          </p>
        </div>
        <CreateTaskDialog projects={projects} />
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No tasks yet</CardTitle>
            <CardDescription>
              {projects.length === 0
                ? "Create a project first, then add tasks to it."
                : "Add your first task to get started."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
            {Object.entries(grouped).map(([status, items]) => (
              <TabsTrigger key={status} value={status}>
                {statusLabels[status]} ({items.length})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-6">
            <TaskGrid tasks={tasks} />
          </TabsContent>

          {Object.entries(grouped).map(([status, items]) => (
            <TabsContent key={status} value={status} className="mt-6">
              <TaskGrid tasks={items} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function TaskGrid({
  tasks,
}: {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    project: { name: string };
  }>;
}) {
  return (
    <div className="grid gap-3">
      {tasks.map((task) => (
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
  );
}

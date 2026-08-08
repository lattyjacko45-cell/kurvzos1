import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardStats } from "@/types";

interface StatsCardsProps {
  stats: DashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: "Total Projects",
      value: stats.totalProjects,
      description: `${stats.activeProjects} active`,
      href: null,
    },
    {
      title: "Total Tasks",
      value: stats.totalTasks,
      description: "Across all projects",
      href: null,
    },
    {
      title: "In Progress",
      value: stats.inProgressTasks,
      description: "Tasks being worked on",
      href: "/dashboard/tasks",
    },
    {
      title: "Completed",
      value: stats.completedTasks,
      description: "View completed work",
      href: "/dashboard/tasks?tab=completed",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const body = (
          <Card className={card.href ? "h-full transition-colors hover:bg-muted/40" : "h-full"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-muted-foreground text-xs">{card.description}</p>
            </CardContent>
          </Card>
        );

        return card.href ? (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {body}
          </Link>
        ) : (
          <div key={card.title}>{body}</div>
        );
      })}
    </div>
  );
}

interface ProjectListProps {
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    _count: { tasks: number };
  }>;
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
          <CardDescription>No projects yet. Create your first one!</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Projects</CardTitle>
        <CardDescription>Your latest project activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{project.name}</p>
                {project.description && (
                  <p className="text-muted-foreground text-sm">
                    {project.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-sm">
                  {project._count.tasks} tasks
                </span>
                <Badge
                  variant={
                    project.status === "ACTIVE" ? "default" : "secondary"
                  }
                >
                  {project.status.toLowerCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface TaskListProps {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    project: { name: string };
  }>;
}

const statusColors: Record<string, string> = {
  TODO: "secondary",
  IN_PROGRESS: "default",
  REVIEW: "outline",
  DONE: "secondary",
};

const priorityColors: Record<string, string> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "outline",
  URGENT: "destructive",
};

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>No tasks yet. Add tasks to your projects!</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Tasks</CardTitle>
        <CardDescription>Latest tasks across your workspace</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-muted-foreground text-sm">
                  {task.project.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={priorityColors[task.priority] as "default"}>
                  {task.priority.toLowerCase()}
                </Badge>
                <Badge variant={statusColors[task.status] as "default"}>
                  {task.status.replace("_", " ").toLowerCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

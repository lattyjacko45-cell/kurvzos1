import type {
  ProjectStatus,
  TaskStatus,
  Priority,
  Role,
} from "@/generated/prisma/client";

export type { ProjectStatus, TaskStatus, Priority, Role };

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

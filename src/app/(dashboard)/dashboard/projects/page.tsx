import type { Metadata } from "next";

import {
  getCurrentUser,
  ensureProfile,
  getUserWorkspace,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateProjectDialog } from "@/components/dashboard/create-dialogs";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);

  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
    include: { _count: { select: { tasks: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto w-full max-w-page space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-display-lg">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage and organize your team&apos;s projects.
          </p>
        </div>
        <CreateProjectDialog workspaceId={workspace.id} />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Create your first project to start organizing work.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <Badge
                    variant={
                      project.status === "ACTIVE" ? "default" : "secondary"
                    }
                  >
                    {project.status.toLowerCase()}
                  </Badge>
                </div>
                {project.description && (
                  <CardDescription>{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {project._count.tasks} task
                  {project._count.tasks !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

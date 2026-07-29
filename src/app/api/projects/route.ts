import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  workspaceId: z.string().uuid(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = createProjectSchema.parse(body);

    const profile = await ensureProfile(
      user.id,
      user.email,
      user.fullName ?? undefined
    );

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        profileId: profile.id,
        workspaceId: data.workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        workspaceId: data.workspaceId,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json(projects);
}

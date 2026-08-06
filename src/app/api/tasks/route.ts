import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().uuid(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  description: z.string().max(1000).optional(),
  /**
   * Optional checklist, created with the task in a single atomic write.
   * Array order becomes step position, so templates keep their sequence.
   */
  steps: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = createTaskSchema.parse(body);

    const profile = await ensureProfile(
      user.id,
      user.email,
      user.fullName ?? undefined
    );

    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        workspace: {
          members: { some: { profileId: profile.id } },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Nested create: Prisma runs the task and its steps as one transaction, so
    // a failure can never leave a task with a partial checklist.
    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        projectId: data.projectId,
        ...(data.steps && data.steps.length > 0
          ? {
              steps: {
                create: data.steps.map((title, index) => ({
                  title,
                  position: index,
                })),
              },
            }
          : {}),
      },
      include: {
        steps: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      },
    });

    return NextResponse.json(task, { status: 201 });
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

  const tasks = await prisma.task.findMany({
    where: {
      project: {
        workspace: {
          members: { some: { profileId: profile.id } },
        },
      },
    },
    include: { project: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(tasks);
}
const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = updateTaskStatusSchema.parse(body);

    const profile = await ensureProfile(
      user.id,
      user.email,
      user.fullName ?? undefined
    );

    const task = await prisma.task.findFirst({
      where: {
        id: data.taskId,
        project: {
          workspace: {
            members: {
              some: { profileId: profile.id },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updatedTask = await prisma.task.update({
      where: { id: data.taskId },
      data: { status: data.status },
    });

    return NextResponse.json(updatedTask);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
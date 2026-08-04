import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createStepSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
});

const updateStepSchema = z
  .object({
    stepId: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.completed !== undefined,
    "Nothing to update"
  );

const deleteStepSchema = z.object({
  stepId: z.string().uuid(),
});

async function getProfileId() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  return profile.id;
}

/** Confirms the task belongs to a workspace the profile is a member of. */
async function findOwnedTask(taskId: string, profileId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        workspace: { members: { some: { profileId } } },
      },
    },
    select: { id: true },
  });
}

/** Confirms the step's parent task belongs to the profile's workspace. */
async function findOwnedStep(stepId: string, profileId: string) {
  return prisma.taskStep.findFirst({
    where: {
      id: stepId,
      task: {
        project: {
          workspace: { members: { some: { profileId } } },
        },
      },
    },
    select: { id: true, taskId: true },
  });
}

export async function GET(request: Request) {
  const profileId = await getProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const task = await findOwnedTask(taskId, profileId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const steps = await prisma.taskStep.findMany({
    where: { taskId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(steps);
}

export async function POST(request: Request) {
  const profileId = await getProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = createStepSchema.parse(await request.json());

    const task = await findOwnedTask(data.taskId, profileId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const last = await prisma.taskStep.findFirst({
      where: { taskId: data.taskId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const step = await prisma.taskStep.create({
      data: {
        taskId: data.taskId,
        title: data.title,
        position: last ? last.position + 1 : 0,
      },
    });

    return NextResponse.json(step, { status: 201 });
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

export async function PATCH(request: Request) {
  const profileId = await getProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = updateStepSchema.parse(await request.json());

    const existing = await findOwnedStep(data.stepId, profileId);
    if (!existing) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    const step = await prisma.taskStep.update({
      where: { id: data.stepId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.completed !== undefined ? { completed: data.completed } : {}),
      },
    });

    return NextResponse.json(step);
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

export async function DELETE(request: Request) {
  const profileId = await getProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = deleteStepSchema.parse(await request.json());

    const existing = await findOwnedStep(data.stepId, profileId);
    if (!existing) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    await prisma.taskStep.delete({ where: { id: data.stepId } });

    // Close the gap left behind so positions stay contiguous.
    const remaining = await prisma.taskStep.findMany({
      where: { taskId: existing.taskId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    await prisma.$transaction(
      remaining.map((step, index) =>
        prisma.taskStep.update({
          where: { id: step.id },
          data: { position: index },
        })
      )
    );

    return NextResponse.json({ success: true });
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

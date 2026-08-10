import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { containsEveryIdExactlyOnce } from "@/lib/task-step-order";

const reorderSchema = z.object({
  taskId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = reorderSchema.parse(await request.json());

    const profile = await ensureProfile(
      user.id,
      user.email,
      user.fullName ?? undefined
    );

    const task = await prisma.task.findFirst({
      where: {
        id: data.taskId,
        project: {
          workspace: { members: { some: { profileId: profile.id } } },
        },
      },
      select: { id: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const steps = await prisma.taskStep.findMany({
      where: { taskId: data.taskId },
      select: { id: true },
    });

    if (
      !containsEveryIdExactlyOnce(
        data.orderedIds,
        steps.map((step) => step.id)
      )
    ) {
      return NextResponse.json(
        { error: "orderedIds must contain every step of this task exactly once" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      data.orderedIds.map((id, index) =>
        prisma.taskStep.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    const updated = await prisma.taskStep.findMany({
      where: { taskId: data.taskId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(updated);
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

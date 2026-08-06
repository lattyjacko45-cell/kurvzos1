import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  assertProjectAccess,
  assertTaskAccess,
  requireProfileId,
} from "@/lib/content.server";
import { MAX_TITLE_LENGTH } from "@/lib/content";

const createContentSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  contentType: z.enum(["LONG_FORM", "SHORT"]).default("LONG_FORM"),
  taskId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  timezone: z.string().trim().min(1).max(100).default("UTC"),
});

export async function GET() {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.contentItem.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    include: {
      task: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = createContentSchema.parse(await request.json());

    // A linked task implies its project, and both must be reachable by this
    // profile — a foreign task id must never attach.
    let projectId = data.projectId ?? null;

    if (data.taskId) {
      const task = await assertTaskAccess(data.taskId, profileId);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      projectId = projectId ?? task.projectId;
    }

    if (projectId) {
      const project = await assertProjectAccess(projectId, profileId);
      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
    }

    const item = await prisma.contentItem.create({
      data: {
        profileId,
        title: data.title,
        contentType: data.contentType,
        taskId: data.taskId ?? null,
        projectId,
        timezone: data.timezone,
      },
    });

    return NextResponse.json(item, { status: 201 });
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

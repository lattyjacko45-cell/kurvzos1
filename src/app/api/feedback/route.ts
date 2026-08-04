import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FEEDBACK_TYPES = [
  "BUG",
  "CONFUSING",
  "MISSING_FEATURE",
  "IMPROVEMENT",
] as const;

const FEEDBACK_STATUSES = [
  "NEW",
  "REVIEWING",
  "FIXED",
  "DISMISSED",
] as const;

const createFeedbackSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  description: z.string().trim().min(1).max(2000),
  page: z.string().trim().min(1).max(500),
  taskId: z.string().uuid().nullish(),
});

const updateFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES),
});

async function requireProfileId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  return profile.id;
}

export async function GET() {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedback = await prisma.feedback.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(feedback);
}

export async function POST(request: Request) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = createFeedbackSchema.parse(await request.json());

    const feedback = await prisma.feedback.create({
      data: {
        profileId,
        type: data.type,
        description: data.description,
        page: data.page,
        taskId: data.taskId ?? null,
      },
    });

    return NextResponse.json(feedback, { status: 201 });
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
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = updateFeedbackSchema.parse(await request.json());

    // Scoped to the submitter so one tester can't edit another's report.
    const existing = await prisma.feedback.findFirst({
      where: { id: data.feedbackId, profileId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const feedback = await prisma.feedback.update({
      where: { id: data.feedbackId },
      data: { status: data.status },
    });

    return NextResponse.json(feedback);
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

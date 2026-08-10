import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeElapsedSeconds,
  toDurationMinutes,
  type FocusSessionDto,
} from "@/lib/focus";
import { Prisma, type FocusSession } from "@/generated/prisma/client";

const startSessionSchema = z.object({
  taskId: z.string().uuid(),
});

const updateSessionSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum([
    "PAUSE",
    "RESUME",
    "RESET",
    "END",
    "CANCEL",
    "COMPLETE_MISSION",
  ]),
});

const OPEN_STATUSES = ["ACTIVE", "PAUSED"] as const;
const SERIALIZABLE_RETRY_ATTEMPTS = 3;

function toDto(session: FocusSession): FocusSessionDto {
  return {
    id: session.id,
    taskId: session.taskId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    lastResumedAt: session.lastResumedAt
      ? session.lastResumedAt.toISOString()
      : null,
    elapsedSeconds: session.elapsedSeconds,
    durationMinutes: session.durationMinutes,
  };
}

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

/** The one session (if any) that currently owns this profile's timer. */
function findOpenSession(profileId: string, taskId?: string) {
  return prisma.focusSession.findFirst({
    where: {
      profileId,
      status: { in: [...OPEN_STATUSES] },
      ...(taskId ? { taskId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

function findOwnedTask(taskId: string, profileId: string) {
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

async function startSessionAtomically(taskId: string, profileId: string) {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.focusSession.findFirst({
            where: {
              profileId,
              status: { in: [...OPEN_STATUSES] },
            },
            orderBy: { createdAt: "desc" },
          });

          if (existing) {
            return {
              outcome: existing.taskId === taskId ? "existing" : "conflict",
              session: existing,
            } as const;
          }

          const now = new Date();
          const session = await tx.focusSession.create({
            data: {
              taskId,
              profileId,
              status: "ACTIVE",
              startedAt: now,
              lastResumedAt: now,
              elapsedSeconds: 0,
            },
          });

          return { outcome: "created", session } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      const shouldRetry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < SERIALIZABLE_RETRY_ATTEMPTS;

      if (!shouldRetry) throw error;
    }
  }

  // The loop either returns or throws. Kept for exhaustive type inference.
  throw new Error("Could not start focus session");
}

/** GET /api/focus-sessions?taskId=... — the open session, or null. */
export async function GET(request: Request) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taskId = new URL(request.url).searchParams.get("taskId") ?? undefined;
  const session = await findOpenSession(profileId, taskId);

  return NextResponse.json(session ? toDto(session) : null);
}

/**
 * POST /api/focus-sessions — start a session.
 *
 * Idempotent by design: if this task already has an open session we hand the
 * same one back, so a refresh or a double click can never create a second
 * timer. An open session on a *different* task is reported as a conflict
 * rather than silently stolen.
 */
export async function POST(request: Request) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = startSessionSchema.parse(await request.json());

    const task = await findOwnedTask(data.taskId, profileId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const result = await startSessionAtomically(data.taskId, profileId);

    if (result.outcome === "conflict") {
      return NextResponse.json(
        {
          error: "Another focus session is already running.",
          session: toDto(result.session),
        },
        { status: 409 }
      );
    }

    return NextResponse.json(toDto(result.session), {
      status: result.outcome === "created" ? 201 : 200,
    });
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

/** PATCH /api/focus-sessions — pause / resume / reset / end / cancel. */
export async function PATCH(request: Request) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = updateSessionSchema.parse(await request.json());

    const session = await prisma.focusSession.findFirst({
      where: { id: data.sessionId, profileId },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "COMPLETED" || session.status === "CANCELLED") {
      return NextResponse.json(
        { error: "This session has already ended." },
        { status: 409 }
      );
    }

    const now = new Date();
    const elapsed = computeElapsedSeconds(toDto(session), now.getTime());

    switch (data.action) {
      case "PAUSE": {
        // Pausing an already-paused session is a no-op, not an error.
        const updated =
          session.status === "PAUSED"
            ? session
            : await prisma.focusSession.update({
                where: { id: session.id },
                data: {
                  status: "PAUSED",
                  elapsedSeconds: elapsed,
                  lastResumedAt: null,
                },
              });

        return NextResponse.json(toDto(updated));
      }

      case "RESUME": {
        const updated =
          session.status === "ACTIVE"
            ? session
            : await prisma.focusSession.update({
                where: { id: session.id },
                data: { status: "ACTIVE", lastResumedAt: now },
              });

        return NextResponse.json(toDto(updated));
      }

      case "RESET": {
        const updated = await prisma.focusSession.update({
          where: { id: session.id },
          data: {
            status: "ACTIVE",
            elapsedSeconds: 0,
            startedAt: now,
            lastResumedAt: now,
          },
        });

        return NextResponse.json(toDto(updated));
      }

      case "END": {
        const updated = await prisma.focusSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            elapsedSeconds: elapsed,
            durationMinutes: toDurationMinutes(elapsed),
            lastResumedAt: null,
            endedAt: now,
          },
        });

        return NextResponse.json(toDto(updated));
      }

      case "CANCEL": {
        const updated = await prisma.focusSession.update({
          where: { id: session.id },
          data: {
            status: "CANCELLED",
            elapsedSeconds: elapsed,
            durationMinutes: toDurationMinutes(elapsed),
            lastResumedAt: null,
            endedAt: now,
          },
        });

        return NextResponse.json(toDto(updated));
      }

      case "COMPLETE_MISSION": {
        // The focus session and its task are one workflow. Completing them in
        // one transaction prevents a DONE task from hiding an open session
        // that would block the next mission's timer.
        const [updated] = await prisma.$transaction([
          prisma.focusSession.update({
            where: { id: session.id },
            data: {
              status: "COMPLETED",
              elapsedSeconds: elapsed,
              durationMinutes: toDurationMinutes(elapsed),
              lastResumedAt: null,
              endedAt: now,
            },
          }),
          prisma.task.update({
            where: { id: session.taskId },
            data: { status: "DONE" },
          }),
        ]);

        return NextResponse.json(toDto(updated));
      }

      default:
        // Unreachable: zod has already constrained `action`. Present so the
        // handler's inferred return type stays `Promise<NextResponse>`.
        return NextResponse.json(
          { error: "Unsupported action" },
          { status: 400 }
        );
    }
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { runHarper, getLatestHarperAdvice } from "@/lib/harper/engine.server";
import { MAX_QUESTION_LENGTH } from "@/lib/harper/prompt";

const askSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH).nullish(),
});

async function resolveContextIds() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);

  return { profileId: profile.id, workspaceId: workspace.id };
}

/** GET — most recent saved advice. Never triggers a model call. */
export async function GET() {
  const ids = await resolveContextIds();
  if (!ids) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latest = await getLatestHarperAdvice(ids.profileId);
  return NextResponse.json(latest);
}

/** POST — generate fresh advice, optionally answering a question. */
export async function POST(request: Request) {
  const ids = await resolveContextIds();
  if (!ids) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const data = askSchema.parse(body);

    const result = await runHarper(
      ids.profileId,
      ids.workspaceId,
      data.question ?? null
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Harper could not respond." },
      { status: 500 }
    );
  }
}

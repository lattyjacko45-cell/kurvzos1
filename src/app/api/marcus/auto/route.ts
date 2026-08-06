import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { buildMarcusContext } from "@/lib/marcus/context.server";
import {
  getLatestMarcusAdvice,
  runMarcus,
} from "@/lib/marcus/engine.server";
import {
  isMarcusSignificantChange,
  parseStoredMarcusContext,
} from "@/lib/marcus/staleness";

/**
 * POST /api/marcus/auto — background financial refresh.
 *
 * Only entered figures, portfolio changes, shipped content and completed work
 * qualify. Checklist edits and timer ticks return `{ refreshed: false }`.
 */
export async function POST() {
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

  try {
    const [context, latest] = await Promise.all([
      buildMarcusContext(profile.id, workspace.id),
      getLatestMarcusAdvice(profile.id),
    ]);

    const savedContext = latest
      ? parseStoredMarcusContext(latest.contextSnapshot)
      : null;

    if (!isMarcusSignificantChange(savedContext, context)) {
      return NextResponse.json({ refreshed: false, reason: "minor-change" });
    }

    const result = await runMarcus(profile.id, workspace.id, null);

    return NextResponse.json({
      refreshed: true,
      source: result.source,
      advice: result.advice,
    });
  } catch {
    return NextResponse.json({ refreshed: false, reason: "error" });
  }
}

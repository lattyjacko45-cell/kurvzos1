import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { buildHarperContext } from "@/lib/harper/context.server";
import {
  getLatestHarperAdvice,
  runHarper,
} from "@/lib/harper/engine.server";
import { isSignificantChange, parseStoredContext } from "@/lib/harper/staleness";

/**
 * POST /api/harper/auto — background refresh after a mission-changing action.
 *
 * The client pings this whenever something notable happens; the *server*
 * decides whether it is worth a model call. Ordinary checklist progress is
 * answered by the deterministic engine on the next render, so this returns
 * `{ refreshed: false }` and spends nothing.
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
      buildHarperContext(profile.id, workspace.id),
      getLatestHarperAdvice(profile.id),
    ]);

    const savedContext = latest
      ? parseStoredContext(latest.contextSnapshot)
      : null;

    if (!isSignificantChange(savedContext, context)) {
      return NextResponse.json({ refreshed: false, reason: "minor-change" });
    }

    const result = await runHarper(profile.id, workspace.id, null);

    return NextResponse.json({
      refreshed: true,
      source: result.source,
      advice: result.advice,
    });
  } catch {
    // A background refresh must never surface as a user-facing failure; the
    // deterministic view already covers the UI.
    return NextResponse.json({ refreshed: false, reason: "error" });
  }
}

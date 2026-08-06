import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { buildReneeContext } from "@/lib/renee/context.server";
import { getLatestReneeAdvice, runRenee } from "@/lib/renee/engine.server";
import {
  isReneeSignificantChange,
  parseStoredReneeContext,
} from "@/lib/renee/staleness";

/**
 * POST /api/renee/auto — background strategy refresh.
 *
 * The client pings after any workspace change; the server decides whether the
 * *portfolio* actually moved. Checklist churn returns `{ refreshed: false }`
 * and spends nothing.
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
      buildReneeContext(profile.id, workspace.id),
      getLatestReneeAdvice(profile.id),
    ]);

    const savedContext = latest
      ? parseStoredReneeContext(latest.contextSnapshot)
      : null;

    if (!isReneeSignificantChange(savedContext, context)) {
      return NextResponse.json({ refreshed: false, reason: "minor-change" });
    }

    const result = await runRenee(profile.id, workspace.id, null);

    return NextResponse.json({
      refreshed: true,
      source: result.source,
      advice: result.advice,
    });
  } catch {
    return NextResponse.json({ refreshed: false, reason: "error" });
  }
}

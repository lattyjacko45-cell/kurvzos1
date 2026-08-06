import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { buildSophiaContext } from "@/lib/sophia/context.server";
import {
  getLatestSophiaAdvice,
  runSophia,
} from "@/lib/sophia/engine.server";
import {
  isSophiaSignificantChange,
  parseStoredSophiaContext,
} from "@/lib/sophia/staleness";

/**
 * POST /api/sophia/auto — background marketing refresh.
 *
 * The client pings after any workspace change; the server decides whether the
 * *pipeline* actually moved. Checklist churn returns `{ refreshed: false }`.
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
      buildSophiaContext(profile.id, workspace.id),
      getLatestSophiaAdvice(profile.id),
    ]);

    const savedContext = latest
      ? parseStoredSophiaContext(latest.contextSnapshot)
      : null;

    if (!isSophiaSignificantChange(savedContext, context)) {
      return NextResponse.json({ refreshed: false, reason: "minor-change" });
    }

    const result = await runSophia(profile.id, workspace.id, null);

    return NextResponse.json({
      refreshed: true,
      source: result.source,
      advice: result.advice,
    });
  } catch {
    return NextResponse.json({ refreshed: false, reason: "error" });
  }
}

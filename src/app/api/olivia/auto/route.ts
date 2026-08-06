import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { buildOliviaContext } from "@/lib/olivia/context.server";
import {
  getLatestOliviaAdvice,
  runOlivia,
} from "@/lib/olivia/engine.server";
import {
  isOliviaSignificantChange,
  parseStoredOliviaContext,
} from "@/lib/olivia/staleness";

/**
 * POST /api/olivia/auto — background operations refresh.
 *
 * The client pings after any workspace change; the server decides whether the
 * *shape* of the work actually moved. A ticked checklist item or a running
 * timer returns `{ refreshed: false }` and spends nothing.
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
      buildOliviaContext(profile.id, workspace.id),
      getLatestOliviaAdvice(profile.id),
    ]);

    const savedContext = latest
      ? parseStoredOliviaContext(latest.contextSnapshot)
      : null;

    if (!isOliviaSignificantChange(savedContext, context)) {
      return NextResponse.json({ refreshed: false, reason: "minor-change" });
    }

    const result = await runOlivia(profile.id, workspace.id, null);

    return NextResponse.json({
      refreshed: true,
      source: result.source,
      advice: result.advice,
    });
  } catch {
    return NextResponse.json({ refreshed: false, reason: "error" });
  }
}

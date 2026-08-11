import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { getDriveFilesForProfile } from "@/lib/drive/read.server";
import { getDriveSetupState } from "@/lib/drive/config";
import { MAX_SEARCH_LENGTH } from "@/lib/drive/normalize";

/**
 * GET /api/integrations/drive/files
 *
 * Recent Drive files for the authenticated profile.
 *
 * Scoping: the profile comes from the session, never from a query parameter, so
 * one user can never request another user's Drive. The credential is looked up
 * by that same profile id.
 *
 * The response carries normalized file metadata only. No access token, refresh
 * token, granted scope, raw Google payload or Google error message is ever
 * included — failures collapse to a fixed `state` plus a closed-set identifier.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const setup = getDriveSetupState();

  if (!setup.configured) {
    // Names of missing variables only — never their values.
    return json(
      { state: "not_configured", files: [], missing: setup.missing },
      503
    );
  }

  const url = new URL(request.url);
  // Bounded before it reaches the query builder, which escapes it.
  const search = (url.searchParams.get("q") ?? "").slice(0, MAX_SEARCH_LENGTH);
  const force = url.searchParams.get("refresh") === "1";

  try {
    const result = await getDriveFilesForProfile(profile.id, {
      search,
      force,
    });

    return json({
      state: result.state,
      accountEmail: result.accountEmail,
      files: result.files,
      incompleteSearch: result.incompleteSearch,
      // Present only on a degraded read; a fixed identifier, never Google text.
      reason: result.reason ?? null,
    });
  } catch {
    // getDriveFilesForProfile already classifies Drive failures, so reaching
    // here means something unexpected. Nothing about it goes to the browser.
    console.error("[drive] files route failed", {
      stage: "route",
      status: 500,
      reason: "unexpected",
      fileCount: 0,
    });

    return json({ state: "error", files: [], reason: "unexpected" }, 500);
  }
}

/** Never cached: this is per-user file metadata. */
function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

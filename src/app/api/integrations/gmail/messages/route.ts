import { NextResponse } from "next/server";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { getInboxForProfile } from "@/lib/gmail/read.server";
import { getGmailSetupState } from "@/lib/gmail/config";

/**
 * GET /api/integrations/gmail/messages
 *
 * Recent inbox messages for the authenticated profile.
 *
 * Scoping: the profile is derived from the session, never from a query
 * parameter, so one user can never request another user's mailbox. The Gmail
 * credential is looked up by that same profile id.
 *
 * The response body carries normalized message metadata only. No access token,
 * refresh token, granted scope, raw Google payload or Google error message is
 * ever included — failures collapse to a fixed `state` plus a short identifier.
 */

export const dynamic = "force-dynamic";

/** Fixed states the browser is allowed to see. */
type ResponseState =
  | "connected"
  | "not_connected"
  | "not_configured"
  | "reconnect_required"
  | "error";

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

  const setup = getGmailSetupState();

  if (!setup.configured) {
    // Names of missing variables only — never their values.
    return json(
      { state: "not_configured", messages: [], missing: setup.missing },
      503
    );
  }

  const force = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const result = await getInboxForProfile(profile.id, { force });

    return json({
      state: result.state as ResponseState,
      emailAddress: result.emailAddress,
      messages: result.messages,
      // Present only on a degraded read; a fixed identifier, never Google text.
      reason: result.reason ?? null,
    });
  } catch {
    // getInboxForProfile already classifies Gmail failures, so reaching here
    // means something unexpected. Nothing about it goes to the browser.
    console.error("[gmail] messages route failed", {
      stage: "route",
      status: 500,
      reason: "unexpected",
      messageCount: 0,
    });

    return json({ state: "error", messages: [], reason: "unexpected" }, 500);
  }
}

/** Never cached: this is per-user mailbox data. */
function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

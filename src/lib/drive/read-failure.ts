/**
 * Classification for a failed Drive *read* (listing recent files), as opposed
 * to `failure.ts`, which classifies a failed OAuth *connect* attempt for the
 * callback page. Dependency-free on purpose so `read-failure.test.mjs` can
 * run it directly — the same arrangement as `failure.ts` and `classify.ts`.
 *
 * `read.server.ts` is not itself unit tested (same reasoning as
 * `harper/engine.server.ts`): it touches Prisma, React's request cache, and
 * `console.error`, none of which belong in a dependency-free branch test.
 * What actually matters for correctness — which failures are expected and
 * silent versus genuinely unexpected and worth logging — lives here instead,
 * where it can be exercised directly.
 *
 * The rule: a disconnected profile, an unconfigured Drive integration, and an
 * expired or scope-insufficient authorization are all *expected* states for
 * an inbox read to land in — a workspace that never connected Drive, or a
 * deployment that never wired up the OAuth client, is not a bug. Only a
 * response that doesn't fit any of those (a 5xx, a network failure, an
 * unrecognised Drive API error) is genuinely unexpected and worth a real
 * `console.error` an operator should see. Getting this wrong is exactly what
 * tripped the Next.js dev error overlay on `/executive-team/harper` for a
 * secondary workspace with no Drive connection: every failure branch,
 * including the entirely expected ones, called `console.error`
 * unconditionally.
 */

export type DriveReadFailureState = "not_connected" | "reconnect_required" | "error";

export interface DriveReadFailureClassification {
  /** What `getDriveFilesForProfile` should report the read state as. */
  state: DriveReadFailureState;
  /** Safe identifier only; never a message from Google. */
  reason: string;
  /** Whether this failure is genuinely unexpected and should be logged. */
  shouldLog: boolean;
}

export interface DriveReadFailureInput {
  /** True when the failure was `DriveNotConfiguredError` — a missing client
   *  id/secret, encryption key, or app URL for this deployment. */
  notConfigured: boolean;
  /** True when the failure was a `DriveApiError` (a real response from
   *  Google, or a client-side wrapper around one), as opposed to some other
   *  thrown value. */
  isApiError: boolean;
  status?: number;
  errorCode?: string;
}

/**
 * Classifies a failed Drive read.
 *
 * Order matters: an unconfigured integration is checked first because it can
 * arrive with no HTTP status at all, and must never fall through to the
 * generic "unexpected" bucket. After that, 401/403 are the same "please
 * reconnect" cases `read.server.ts`'s doc comment already calls out — a
 * profile authorized before Drive existed, or whose grant expired, both read
 * as a permissions error from Google's side, not a defect in this app.
 */
export function classifyDriveReadFailure(
  input: DriveReadFailureInput
): DriveReadFailureClassification {
  if (input.notConfigured) {
    return { state: "not_connected", reason: "not_configured", shouldLog: false };
  }

  const reason = input.isApiError
    ? (input.errorCode ?? "request_failed")
    : "unexpected";

  const needsReconnect = input.status === 401 || input.status === 403;

  return {
    state: needsReconnect ? "reconnect_required" : "error",
    reason,
    shouldLog: !needsReconnect,
  };
}

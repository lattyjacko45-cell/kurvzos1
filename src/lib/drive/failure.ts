/**
 * Classification of Google Drive API failures.
 *
 * Dependency-free on purpose so `failure.test.mjs` can run it directly and a
 * client component can import it. Mirrors `lib/gmail/failure.ts` and the
 * YouTube channel-lookup classifier: Google's raw reason strings map onto a
 * small closed set, which is what makes the value safe to put in a redirect URL
 * and a log — it can never carry an address, a filename or free text.
 */

export type DriveFailureReason =
  | "drive_api_disabled"
  | "insufficient_permissions"
  | "auth_error"
  | "rate_limited"
  | "http_error"
  | "unexpected";

/** Google reasons we recognise, mapped onto our closed set. */
const KNOWN_DRIVE_REASONS: Record<string, DriveFailureReason> = {
  accessNotConfigured: "drive_api_disabled",
  SERVICE_DISABLED: "drive_api_disabled",

  insufficientPermissions: "insufficient_permissions",
  ACCESS_TOKEN_SCOPE_INSUFFICIENT: "insufficient_permissions",
  PERMISSION_DENIED: "insufficient_permissions",
  forbidden: "insufficient_permissions",
  insufficientFilePermissions: "insufficient_permissions",

  authError: "auth_error",
  UNAUTHENTICATED: "auth_error",
  invalid_grant: "auth_error",

  rateLimitExceeded: "rate_limited",
  userRateLimitExceeded: "rate_limited",
  dailyLimitExceeded: "rate_limited",
  quotaExceeded: "rate_limited",
  sharingRateLimitExceeded: "rate_limited",
};

/**
 * Maps a Drive failure onto the closed set.
 *
 * Google's own reason wins when we recognise it; otherwise the HTTP status
 * decides, because a 401 and a 403 still say something useful on their own.
 */
export function classifyDriveFailure(
  status: number | undefined,
  googleReason: string | undefined
): DriveFailureReason {
  if (googleReason && KNOWN_DRIVE_REASONS[googleReason]) {
    return KNOWN_DRIVE_REASONS[googleReason];
  }

  if (status === 401) return "auth_error";
  if (status === 403) return "insufficient_permissions";
  if (status === 429) return "rate_limited";
  if (typeof status === "number") return "http_error";

  return "unexpected";
}

/** What the person should actually do about it. */
export const DRIVE_FAILURE_HINTS: Record<DriveFailureReason, string> = {
  drive_api_disabled:
    "The Google Drive API is not enabled on the Cloud project this OAuth client belongs to. Enable Google Drive API in that project, then connect again.",
  insufficient_permissions:
    "The consent screen did not grant read-only Drive metadata access. Remove KurvzOS at myaccount.google.com/permissions, then connect again and accept the Drive permission.",
  auth_error:
    "Google rejected the credential while reading Drive. Connect again to issue a fresh authorization.",
  rate_limited:
    "Google is rate limiting Drive requests for this project. Wait a moment and try again.",
  http_error:
    "The request to Drive did not complete. Check network access to googleapis.com, then try again.",
  unexpected: "Google returned an unrecognised response for the Drive request.",
};

/**
 * Type guard so a URL parameter can be trusted before it indexes the map.
 *
 * hasOwnProperty rather than `in`: `in` walks the prototype chain, so
 * `?reason=constructor` would otherwise pass and index Object.prototype.
 */
export function isDriveFailureReason(
  value: string | undefined
): value is DriveFailureReason {
  return Boolean(
    value && Object.prototype.hasOwnProperty.call(DRIVE_FAILURE_HINTS, value)
  );
}

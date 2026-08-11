import { hasEncryptionKey } from "@/lib/crypto";

/**
 * Google Drive wiring.
 *
 * Shares the Google OAuth client credentials with the YouTube, Calendar and
 * Gmail integrations — one Google Cloud project, one client id, one encryption
 * key. Only the scope, the callback path, the state cookie and the connection
 * row differ. This is deliberately NOT a fourth OAuth architecture.
 *
 * Provider-side all four are one combined authorization (same project plus
 * include_granted_scopes=true), which is why no disconnect in KurvzOS revokes
 * at Google — doing so would drop the other three with it.
 *
 * Nothing throws on import; a missing credential renders a setup state.
 */

/**
 * Scope choice, verified against Google's current "Choose Google Drive API
 * scopes" guidance.
 *
 * `drive.metadata.readonly` — "View metadata for files in your Drive."
 *
 * Why this one:
 *  - `drive.file` is non-sensitive and would be preferable, but it only ever
 *    sees files the user explicitly picks through the Google Picker or that the
 *    app itself created. It cannot list a user's recent files, which is the
 *    whole of Phase 1.
 *  - `drive.readonly` would work but is strictly broader: it permits
 *    downloading file *content*. Phase 1 shows names, types and dates only.
 *
 * `drive.metadata.readonly` is therefore the narrowest scope that satisfies the
 * requirement, and it makes the "never download file content" rule an API-level
 * impossibility rather than a coding convention — Google will not serve bytes
 * under this grant at all.
 *
 * NOTE: Google classifies this as a RESTRICTED scope. That is fine while the
 * OAuth consent screen is in Testing with named test users. Publishing this app
 * publicly would require restricted-scope verification and a CASA security
 * assessment. See the report accompanying this milestone.
 */
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
/** Used only to label the connection card with the connected account. */
export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";

/** Distinct from the YouTube, Calendar and Gmail state cookies. */
export const DRIVE_OAUTH_STATE_COOKIE = "kurvzos_drive_oauth_state";

export interface DriveEnv {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

export interface DriveSetupState {
  configured: boolean;
  missing: string[];
}

function readAppUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

/** Never throws. Pages use this to choose between the card and a setup state. */
export function getDriveSetupState(): DriveSetupState {
  const missing: string[] = [];

  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!hasEncryptionKey()) missing.push("YOUTUBE_TOKEN_ENCRYPTION_KEY");
  if (!readAppUrl()) missing.push("NEXT_PUBLIC_APP_URL");

  return { configured: missing.length === 0, missing };
}

export class DriveNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Drive integration is not configured. Missing: ${missing.join(", ")}`);
    this.name = "DriveNotConfiguredError";
    this.missing = missing;
  }
}

export function requireDriveEnv(): DriveEnv {
  const state = getDriveSetupState();
  if (!state.configured) throw new DriveNotConfiguredError(state.missing);

  return {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    appUrl: readAppUrl() as string,
  };
}

/** Always derived from NEXT_PUBLIC_APP_URL — never hardcoded. */
export function getDriveRedirectUri(appUrl: string): string {
  return `${appUrl}/api/drive/callback`;
}

const LOCAL_APP_URL = "http://localhost:3000";

/** Values to paste into Google Cloud. Never contains a secret. */
export function getDriveOAuthSetupDetails(): {
  origin: string;
  redirectUri: string;
  isFallback: boolean;
} {
  const appUrl = readAppUrl();

  return {
    origin: appUrl ?? LOCAL_APP_URL,
    redirectUri: getDriveRedirectUri(appUrl ?? LOCAL_APP_URL),
    isFallback: !appUrl,
  };
}

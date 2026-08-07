import { hasEncryptionKey } from "@/lib/crypto";

/**
 * Environment wiring for the YouTube integration.
 *
 * Nothing here throws on import — a missing credential must render a setup
 * state, not crash the app.
 */

/** Minimum scopes: upload a video + read back channel and processing status. */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

/**
 * Cookie holding the CSRF state between /connect and /callback.
 * Lives here rather than in a route module: Next validates route exports and
 * rejects non-route values exported from a `route.ts`.
 */
export const OAUTH_STATE_COOKIE = "kurvzos_yt_oauth_state";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/**
 * Present for reference only — nothing calls it. See the note in
 * /api/youtube/disconnect: revocation is combined across this project's
 * grants and would disconnect Calendar too.
 */
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_UPLOAD_BASE =
  "https://www.googleapis.com/upload/youtube/v3";

export interface YouTubeEnv {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

export interface YouTubeSetupState {
  configured: boolean;
  /** Names of the env vars that still need values. */
  missing: string[];
}

function readAppUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

/** Never throws. Used by pages to decide between the form and a setup card. */
export function getYouTubeSetupState(): YouTubeSetupState {
  const missing: string[] = [];

  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!hasEncryptionKey()) missing.push("YOUTUBE_TOKEN_ENCRYPTION_KEY");
  if (!readAppUrl()) missing.push("NEXT_PUBLIC_APP_URL");

  return { configured: missing.length === 0, missing };
}

export class YouTubeNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`YouTube integration is not configured. Missing: ${missing.join(", ")}`);
    this.name = "YouTubeNotConfiguredError";
    this.missing = missing;
  }
}

/** Throws YouTubeNotConfiguredError when anything is missing. */
export function requireYouTubeEnv(): YouTubeEnv {
  const state = getYouTubeSetupState();
  if (!state.configured) throw new YouTubeNotConfiguredError(state.missing);

  return {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    appUrl: readAppUrl() as string,
  };
}

/** Callback URL is always derived from NEXT_PUBLIC_APP_URL — never hardcoded. */
export function getRedirectUri(appUrl: string): string {
  return `${appUrl}/api/youtube/callback`;
}

/** Shown in the setup card so the values can be pasted into Google Cloud. */
export interface OAuthSetupDetails {
  /** Authorised JavaScript origin. */
  origin: string;
  /** Authorised redirect URI. */
  redirectUri: string;
  /** True when we fell back to the local default because the env is unset. */
  isFallback: boolean;
}

const LOCAL_APP_URL = "http://localhost:3000";

/**
 * Derives the two values Google Cloud needs. When NEXT_PUBLIC_APP_URL is not
 * set we show the local development defaults rather than a blank card, so the
 * user can still complete setup.
 */
export function getOAuthSetupDetails(): OAuthSetupDetails {
  const appUrl = readAppUrl();

  return {
    origin: appUrl ?? LOCAL_APP_URL,
    redirectUri: getRedirectUri(appUrl ?? LOCAL_APP_URL),
    isFallback: !appUrl,
  };
}

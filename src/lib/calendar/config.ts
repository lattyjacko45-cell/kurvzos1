import { hasEncryptionKey } from "@/lib/crypto";

/**
 * Google Calendar wiring.
 *
 * Shares the Google OAuth client credentials with the YouTube integration, but
 * has its own scope, callback, state cookie and connection row. No code path
 * here reads or writes YouTube's stored token.
 *
 * Provider-side, however, the two are NOT independent: the same Google Cloud
 * project plus include_granted_scopes=true means Google holds a single
 * combined authorization. Revoking it would drop both integrations, which is
 * why disconnect is local-only in KurvzOS.
 *
 * Nothing throws on import — a missing credential renders a setup card.
 */

/**
 * Read-only, event-level access. Narrower than calendar.readonly (which also
 * exposes calendar lists and settings) and far narrower than calendar, which
 * would permit writes. This milestone never mutates a calendar.
 */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/**
 * Present for reference only — nothing calls it.
 *
 * Revocation drops every scope this Google Cloud project holds, which would
 * disconnect YouTube and Calendar together. Only a future explicit
 * "Disconnect Google from KurvzOS" action should ever use it.
 */
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/** Distinct from the YouTube state cookie so the two flows cannot collide. */
export const CALENDAR_OAUTH_STATE_COOKIE = "kurvzos_cal_oauth_state";

export interface CalendarEnv {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

export interface CalendarSetupState {
  configured: boolean;
  missing: string[];
}

function readAppUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

/** Never throws. Used by pages to choose between the card and a setup state. */
export function getCalendarSetupState(): CalendarSetupState {
  const missing: string[] = [];

  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!hasEncryptionKey()) missing.push("YOUTUBE_TOKEN_ENCRYPTION_KEY");
  if (!readAppUrl()) missing.push("NEXT_PUBLIC_APP_URL");

  return { configured: missing.length === 0, missing };
}

export class CalendarNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Calendar integration is not configured. Missing: ${missing.join(", ")}`);
    this.name = "CalendarNotConfiguredError";
    this.missing = missing;
  }
}

export function requireCalendarEnv(): CalendarEnv {
  const state = getCalendarSetupState();
  if (!state.configured) throw new CalendarNotConfiguredError(state.missing);

  return {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    appUrl: readAppUrl() as string,
  };
}

/** Always derived from NEXT_PUBLIC_APP_URL — never hardcoded. */
export function getCalendarRedirectUri(appUrl: string): string {
  return `${appUrl}/api/calendar/callback`;
}

const LOCAL_APP_URL = "http://localhost:3000";

/** Values to paste into Google Cloud. Never contains a secret. */
export function getCalendarOAuthSetupDetails(): {
  origin: string;
  redirectUri: string;
  isFallback: boolean;
} {
  const appUrl = readAppUrl();

  return {
    origin: appUrl ?? LOCAL_APP_URL,
    redirectUri: getCalendarRedirectUri(appUrl ?? LOCAL_APP_URL),
    isFallback: !appUrl,
  };
}

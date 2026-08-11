import { hasEncryptionKey } from "@/lib/crypto";

/**
 * Gmail wiring.
 *
 * Shares the Google OAuth client credentials with the YouTube and Calendar
 * integrations — one Google Cloud project, one client id, one encryption key.
 * This is deliberately NOT a second OAuth architecture: only the scope, the
 * callback path, the state cookie and the connection row differ.
 *
 * Provider-side the three are one combined authorization (same project plus
 * include_granted_scopes=true), which is why no disconnect in KurvzOS revokes
 * at Google — doing so would drop the other two integrations with it.
 *
 * Nothing throws on import; a missing credential renders a setup state.
 */

/**
 * Scope choice, and why it is not the narrower one.
 *
 * `gmail.metadata` is the smaller scope and would cover sender, subject and
 * date — but Google does not return the `snippet` field under it, and Phase 1
 * requires a preview line. `gmail.readonly` is therefore the minimum scope that
 * satisfies the requirement.
 *
 * Two things keep the blast radius small despite the broader scope:
 *  - Every request this integration makes uses `format=metadata`, so message
 *    bodies, attachments and raw MIME are never downloaded.
 *  - It is a *readonly* scope. There is no send, modify, or delete capability
 *    in the grant at all, so no code path — present or future — can act on the
 *    mailbox with this credential.
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

/** Distinct from the YouTube and Calendar state cookies. */
export const GMAIL_OAUTH_STATE_COOKIE = "kurvzos_gmail_oauth_state";

export interface GmailEnv {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

export interface GmailSetupState {
  configured: boolean;
  missing: string[];
}

function readAppUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

/** Never throws. Pages use this to choose between the card and a setup state. */
export function getGmailSetupState(): GmailSetupState {
  const missing: string[] = [];

  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!hasEncryptionKey()) missing.push("YOUTUBE_TOKEN_ENCRYPTION_KEY");
  if (!readAppUrl()) missing.push("NEXT_PUBLIC_APP_URL");

  return { configured: missing.length === 0, missing };
}

export class GmailNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Gmail integration is not configured. Missing: ${missing.join(", ")}`);
    this.name = "GmailNotConfiguredError";
    this.missing = missing;
  }
}

export function requireGmailEnv(): GmailEnv {
  const state = getGmailSetupState();
  if (!state.configured) throw new GmailNotConfiguredError(state.missing);

  return {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    appUrl: readAppUrl() as string,
  };
}

/** Always derived from NEXT_PUBLIC_APP_URL — never hardcoded. */
export function getGmailRedirectUri(appUrl: string): string {
  return `${appUrl}/api/gmail/callback`;
}

const LOCAL_APP_URL = "http://localhost:3000";

/** Values to paste into Google Cloud. Never contains a secret. */
export function getGmailOAuthSetupDetails(): {
  origin: string;
  redirectUri: string;
  isFallback: boolean;
} {
  const appUrl = readAppUrl();

  return {
    origin: appUrl ?? LOCAL_APP_URL,
    redirectUri: getGmailRedirectUri(appUrl ?? LOCAL_APP_URL),
    isFallback: !appUrl,
  };
}

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  GMAIL_API_BASE,
  GMAIL_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  getGmailRedirectUri,
  requireGmailEnv,
} from "@/lib/gmail/config";
import {
  normalizeGmailMessages,
  type GmailMessage,
  type RawGmailMessage,
} from "@/lib/gmail/normalize";

/**
 * Gmail access — read only.
 *
 * There is no write path in this module by construction: no send, modify,
 * trash, delete or label mutation exists here, so no code path can act on the
 * mailbox. The granted scope is read-only as well, so this is enforced twice.
 *
 * Message content is limited at the request itself. Every read uses
 * `format=metadata` with an explicit `metadataHeaders` allowlist, so Google
 * never sends us a body, an attachment or raw MIME in the first place.
 */

export class GmailApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

/** Only Google's short identifier — never a body or a message. */
function readGoogleErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const top = (payload as { error?: unknown }).error;
  if (typeof top === "string") return top;

  if (top && typeof top === "object") {
    const { status, errors } = top as {
      status?: unknown;
      errors?: Array<{ reason?: unknown }>;
    };

    const reason = errors?.[0]?.reason;
    if (typeof reason === "string") return reason;
    if (typeof status === "string") return status;
  }

  return undefined;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export function buildGmailAuthorizationUrl(state: string): string {
  const env = requireGmailEnv();

  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: getGmailRedirectUri(env.appUrl),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    // Incremental authorization: adds Gmail alongside any existing YouTube and
    // Calendar grants rather than replacing them.
    include_granted_scopes: "true",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function postForm(
  url: string,
  body: Record<string, string>
): Promise<GoogleTokenResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);

    throw new GmailApiError(
      "Google rejected the token request.",
      response.status,
      readGoogleErrorCode(payload)
    );
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeGmailCode(
  code: string
): Promise<GoogleTokenResponse> {
  const env = requireGmailEnv();

  return postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: getGmailRedirectUri(env.appUrl),
    grant_type: "authorization_code",
  });
}

/**
 * Fresh access token from the stored Gmail refresh token.
 *
 * The refresh token is decrypted here and nowhere else, and only the
 * short-lived access token leaves this function — never to a caller outside the
 * server, and never to a log.
 */
export async function getGmailAccessToken(profileId: string): Promise<string> {
  const connection = await prisma.gmailConnection.findUnique({
    where: { profileId },
    select: { encryptedRefreshToken: true },
  });

  if (!connection) {
    throw new GmailApiError("No Gmail account is connected.", 428);
  }

  const env = requireGmailEnv();
  const refreshToken = decryptSecret(connection.encryptedRefreshToken);

  try {
    const tokens = await postForm(GOOGLE_TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
    });

    return tokens.access_token;
  } catch {
    throw new GmailApiError(
      "Your Gmail authorization has expired. Reconnect Gmail.",
      401
    );
  }
}

async function gmailFetch(
  path: string,
  accessToken: string
): Promise<Response> {
  return fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

async function failFrom(
  response: Response,
  message: string
): Promise<GmailApiError> {
  const payload: unknown = await response.json().catch(() => null);

  return new GmailApiError(
    message,
    response.status,
    readGoogleErrorCode(payload)
  );
}

/** The connected mailbox address, for the connection card. */
export async function fetchGmailProfile(
  accessToken: string
): Promise<{ emailAddress: string }> {
  const response = await gmailFetch("/users/me/profile", accessToken);

  if (!response.ok) {
    throw await failFrom(response, "Could not read the Gmail profile.");
  }

  const payload = (await response.json()) as { emailAddress?: string };

  return { emailAddress: payload.emailAddress ?? "Connected mailbox" };
}

/**
 * The only headers we ask Google for.
 *
 * Recipients, cc, bcc, reply-to, delivery headers and everything else are not
 * requested, so they never reach this process.
 */
const METADATA_HEADERS = ["From", "Subject", "Date"] as const;

const DEFAULT_MAX_RESULTS = 15;
const MAX_ALLOWED_RESULTS = 20;

/**
 * Recent inbox messages, normalized.
 *
 * Two calls per read, which is Gmail's documented shape: `messages.list`
 * returns ids only, then each id is fetched for its metadata. The per-message
 * calls run concurrently and every one uses `format=metadata`, so no body is
 * ever downloaded.
 *
 * A single message that fails to fetch is dropped rather than failing the whole
 * inbox — one unreadable message should not blank the page.
 */
export async function listRecentInboxMessages(
  accessToken: string,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<GmailMessage[]> {
  const capped = Math.min(Math.max(1, maxResults), MAX_ALLOWED_RESULTS);

  const listParams = new URLSearchParams({
    maxResults: String(capped),
    labelIds: "INBOX",
  });

  const listResponse = await gmailFetch(
    `/users/me/messages?${listParams.toString()}`,
    accessToken
  );

  if (!listResponse.ok) {
    throw await failFrom(listResponse, "Could not read the inbox.");
  }

  const listPayload = (await listResponse.json()) as {
    messages?: Array<{ id?: string }>;
  };

  const ids = (listPayload.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return [];

  const detailParams = new URLSearchParams({ format: "metadata" });
  for (const header of METADATA_HEADERS) {
    detailParams.append("metadataHeaders", header);
  }

  const settled = await Promise.allSettled(
    ids.map(async (id) => {
      const response = await gmailFetch(
        `/users/me/messages/${encodeURIComponent(id)}?${detailParams.toString()}`,
        accessToken
      );

      if (!response.ok) {
        throw await failFrom(response, "Could not read a message.");
      }

      return (await response.json()) as RawGmailMessage;
    })
  );

  const raw = settled
    .filter(
      (result): result is PromiseFulfilledResult<RawGmailMessage> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value);

  return normalizeGmailMessages(raw);
}

/*
 * There is deliberately no revoke helper in this module.
 *
 * Gmail, Calendar and YouTube are authorised through the same Google Cloud
 * project with include_granted_scopes=true, which Google treats as one
 * combined authorization. Revoking here would drop all three. Disconnecting
 * Gmail is a local operation — see /api/gmail/disconnect.
 */

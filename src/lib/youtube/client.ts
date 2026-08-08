import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { YouTubeVideoFacts } from "@/lib/youtube/status-map";
import {
  GOOGLE_TOKEN_URL,
  YOUTUBE_API_BASE,
  YOUTUBE_UPLOAD_BASE,
  YOUTUBE_SCOPES,
  GOOGLE_AUTH_URL,
  getRedirectUri,
  requireYouTubeEnv,
} from "@/lib/youtube/config";

/**
 * Server-side YouTube access.
 *
 * Rules enforced here:
 *  - The refresh token is only ever read from the database and decrypted in
 *    this module. It is never returned to a caller or written to a log.
 *  - Access tokens are short-lived, fetched per operation, and never persisted.
 *  - Google error bodies are surfaced as generic messages; we never echo a
 *    response that could contain a token.
 */

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export class YouTubeApiError extends Error {
  readonly status: number;
  /**
   * Google's own short error identifier — "invalid_client",
   * "redirect_uri_mismatch", "accessNotConfigured". Safe to log: it is a fixed
   * enum value, never a token, code or free-text body.
   */
  readonly errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

/**
 * Pulls only the safe identifier out of a Google error payload.
 *
 * OAuth token errors use a top-level `error` string; Data API errors nest a
 * `reason` under `error.errors[0]`. Nothing else is read, so the body itself —
 * which can echo request parameters — never leaves this function.
 */
function readGoogleErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const top = (payload as { error?: unknown }).error;

  // OAuth style: { "error": "invalid_grant", ... }
  if (typeof top === "string") return top;

  // Data API style: { "error": { "status": "...", "errors": [{ reason }] } }
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

export function buildAuthorizationUrl(state: string): string {
  const env = requireYouTubeEnv();

  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: getRedirectUri(env.appUrl),
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    // offline + consent guarantees a refresh_token on first authorisation.
    access_type: "offline",
    prompt: "consent",
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
    // Identifier only: the body can echo request parameters.
    const payload: unknown = await response.json().catch(() => null);

    throw new YouTubeApiError(
      "Google rejected the token request.",
      response.status,
      readGoogleErrorCode(payload)
    );
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<GoogleTokenResponse> {
  const env = requireYouTubeEnv();

  return postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: getRedirectUri(env.appUrl),
    grant_type: "authorization_code",
  });
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const env = requireYouTubeEnv();

  const tokens = await postForm(GOOGLE_TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
  });

  return tokens.access_token;
}

/**
 * Returns a fresh access token for the profile's connected channel.
 * Throws if the profile has no connection.
 */
export interface ShortLivedAccessToken {
  accessToken: string;
  /** Seconds until Google expires it, as reported by Google. */
  expiresIn: number;
}

/**
 * Mints a short-lived access token for the profile's channel.
 *
 * Used where the browser must authenticate directly to Google — the resumable
 * upload PUT requires an Authorization header per the YouTube Data API
 * protocol. The refresh token never leaves the server; only this short-lived
 * token is handed out, and only for the duration of one upload.
 */
export async function mintAccessTokenForProfile(
  profileId: string
): Promise<ShortLivedAccessToken> {
  const connection = await prisma.youTubeConnection.findUnique({
    where: { profileId },
    select: { encryptedRefreshToken: true },
  });

  if (!connection) {
    throw new YouTubeApiError("No YouTube channel is connected.", 428);
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken);
  const env = requireYouTubeEnv();

  try {
    const tokens = await postForm(GOOGLE_TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
    });

    return {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in ?? 3600,
    };
  } catch {
    throw new YouTubeApiError(
      "Your YouTube authorization has expired. Reconnect the channel to continue.",
      401
    );
  }
}

export async function getAccessTokenForProfile(
  profileId: string
): Promise<string> {
  const connection = await prisma.youTubeConnection.findUnique({
    where: { profileId },
    select: { encryptedRefreshToken: true },
  });

  if (!connection) {
    throw new YouTubeApiError("No YouTube channel is connected.", 428);
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken);

  try {
    return await refreshAccessToken(refreshToken);
  } catch {
    // Google returns 400 invalid_grant once a refresh token is revoked or
    // expired. Surfaced as 401 so the UI can prompt a reconnect rather than
    // showing a generic failure.
    throw new YouTubeApiError(
      "Your YouTube authorization has expired. Reconnect the channel to continue.",
      401
    );
  }
}

async function youtubeFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  return response;
}

export interface ChannelSummary {
  channelId: string;
  channelTitle: string;
}

/**
 * Safe, documented outcomes of the channel lookup.
 *
 * This is a closed set: anything Google returns that is not on it becomes
 * "unexpected". That keeps the value safe to log and to place in a redirect
 * URL — it can never carry a channel id, a title, an email or a token.
 */
export type ChannelLookupReason =
  | "ok"
  | "no_channel_returned"
  | "youtubeSignupRequired"
  | "insufficientPermissions"
  | "accessNotConfigured"
  | "quotaExceeded"
  | "authError"
  | "http_error"
  | "unexpected";

export interface ChannelLookupResult {
  ok: boolean;
  status: number;
  reason: ChannelLookupReason;
  /** Number of channels Google returned. Zero is the interesting case. */
  itemsCount: number;
  /** Only populated when reason is "ok". */
  channel: ChannelSummary | null;
}

/** Google reasons we recognise, mapped onto our closed set. */
const KNOWN_CHANNEL_REASONS: Record<string, ChannelLookupReason> = {
  youtubeSignupRequired: "youtubeSignupRequired",
  insufficientPermissions: "insufficientPermissions",
  forbidden: "insufficientPermissions",
  authError: "authError",
  accessNotConfigured: "accessNotConfigured",
  SERVICE_DISABLED: "accessNotConfigured",
  PERMISSION_DENIED: "insufficientPermissions",
  quotaExceeded: "quotaExceeded",
  dailyLimitExceeded: "quotaExceeded",
  rateLimitExceeded: "quotaExceeded",
  userRateLimitExceeded: "quotaExceeded",
};

function classifyChannelFailure(
  status: number,
  googleReason: string | undefined
): ChannelLookupReason {
  if (googleReason && KNOWN_CHANNEL_REASONS[googleReason]) {
    return KNOWN_CHANNEL_REASONS[googleReason];
  }

  // No usable reason: fall back to what the status alone tells us.
  if (status === 401) return "authError";
  if (status === 403) return "insufficientPermissions";
  if (status === 429) return "quotaExceeded";

  return "http_error";
}

/**
 * Reads the authenticated account's own channel.
 *
 * Returns a result rather than throwing so the caller can record exactly which
 * of the documented failure modes occurred. `mine=true` is unchanged — this is
 * the same request, only its outcome is now classified.
 */
export async function lookupOwnChannel(
  accessToken: string
): Promise<ChannelLookupResult> {
  let response: Response;

  try {
    response = await youtubeFetch(
      `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`,
      accessToken
    );
  } catch {
    // Network-level failure: no status exists.
    return { ok: false, status: 0, reason: "http_error", itemsCount: 0, channel: null };
  }

  if (!response.ok) {
    const errorPayload: unknown = await response.json().catch(() => null);
    const googleReason = readGoogleErrorCode(errorPayload);

    return {
      ok: false,
      status: response.status,
      reason: classifyChannelFailure(response.status, googleReason),
      itemsCount: 0,
      channel: null,
    };
  }

  let payload: {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
  };

  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      reason: "unexpected",
      itemsCount: 0,
      channel: null,
    };
  }

  const items = payload.items ?? [];

  // A 200 with no items is the distinctive case: the token is valid and the
  // API is enabled, but this identity owns no channel that `mine=true` can
  // see. Commonly a Brand Account channel authorised as the personal account.
  if (items.length === 0) {
    return {
      ok: false,
      status: response.status,
      reason: "no_channel_returned",
      itemsCount: 0,
      channel: null,
    };
  }

  const first = items[0];

  if (!first.id) {
    return {
      ok: false,
      status: response.status,
      reason: "unexpected",
      itemsCount: items.length,
      channel: null,
    };
  }

  return {
    ok: true,
    status: response.status,
    reason: "ok",
    itemsCount: items.length,
    channel: {
      channelId: first.id,
      channelTitle: first.snippet?.title ?? "YouTube channel",
    },
  };
}

export interface ResumableSessionInput {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  madeForKids: boolean;
  /** ISO instant; when present the video is uploaded private and scheduled. */
  publishAt: string | null;
  fileSize: number;
  mimeType: string;
}

/**
 * Starts a YouTube resumable upload session and returns the session URL.
 * The browser PUTs the video bytes straight to this URL — the file never
 * passes through our server.
 */
/**
 * Starts a YouTube resumable upload session and returns the session URL.
 *
 * `browserOrigin` is forwarded as an Origin header. This is documented
 * behaviour for Google Cloud Storage resumable sessions, where it determines
 * whether the returned URI is CORS-enabled. It is NOT verified for the YouTube
 * upload endpoint, so treat it as a defensive measure rather than a diagnosis:
 * it is harmless on a server-to-server call and can be removed if it ever
 * proves unnecessary.
 *
 * Note that the session URI is NOT sufficient on its own. Per the YouTube Data
 * API resumable protocol, the subsequent upload PUT — and any status or resume
 * request — must also carry `Authorization: Bearer <access token>`.
 */
export async function createResumableUploadSession(
  accessToken: string,
  input: ResumableSessionInput,
  browserOrigin: string
): Promise<string> {
  const body = {
    snippet: {
      title: input.title,
      description: input.description,
      tags: input.tags,
      categoryId: input.categoryId,
    },
    status: {
      // Scheduled videos must be uploaded private; publishAt does the rest.
      privacyStatus: "private",
      selfDeclaredMadeForKids: input.madeForKids,
      ...(input.publishAt ? { publishAt: input.publishAt } : {}),
    },
  };

  const response = await youtubeFetch(
    `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
    accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Upload-Content-Length": String(input.fileSize),
        "X-Upload-Content-Type": input.mimeType,
        // Makes the returned session URI CORS-enabled for this origin.
        Origin: browserOrigin,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorPayload: unknown = await response.json().catch(() => null);

    throw new YouTubeApiError(
      "YouTube refused to start the upload session.",
      response.status,
      readGoogleErrorCode(errorPayload)
    );
  }

  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) {
    throw new YouTubeApiError(
      "YouTube did not return an upload URL.",
      response.status
    );
  }

  return uploadUrl;
}

/**
 * Reads the live status of one video.
 *
 * `part=status,processingDetails` is required: `publishAt`, `privacyStatus`,
 * `uploadStatus`, `failureReason` and `rejectionReason` all live on `status`,
 * while `processingStatus` and `processingFailureReason` live on
 * `processingDetails`. Requesting only one part silently yields nulls for the
 * other half of the mapping.
 *
 * All three distinct "why did it go wrong" fields are read. They are NOT
 * interchangeable: `failureReason` explains a failed upload, `rejectionReason`
 * explains a rejected video, and `processingFailureReason` explains failed
 * processing. Reading only `failureReason` — as this did — left every rejected
 * video with a generic message.
 */
export async function fetchVideoStatus(
  accessToken: string,
  videoId: string
): Promise<YouTubeVideoFacts | null> {
  const response = await youtubeFetch(
    `${YOUTUBE_API_BASE}/videos?part=status,processingDetails&id=${encodeURIComponent(videoId)}`,
    accessToken
  );

  if (!response.ok) {
    throw new YouTubeApiError(
      "Could not read the video status from YouTube.",
      response.status
    );
  }

  const payload = (await response.json()) as {
    items?: Array<{
      status?: {
        uploadStatus?: string;
        privacyStatus?: string;
        publishAt?: string;
        failureReason?: string;
        rejectionReason?: string;
      };
      processingDetails?: {
        processingStatus?: string;
        processingFailureReason?: string;
      };
    }>;
  };

  const item = payload.items?.[0];
  if (!item) return null;

  return {
    uploadStatus: item.status?.uploadStatus ?? null,
    privacyStatus: item.status?.privacyStatus ?? null,
    processingStatus: item.processingDetails?.processingStatus ?? null,
    publishAt: item.status?.publishAt ?? null,
    failureReason: item.status?.failureReason ?? null,
    rejectionReason: item.status?.rejectionReason ?? null,
    processingFailureReason:
      item.processingDetails?.processingFailureReason ?? null,
  };
}

export async function setThumbnail(
  accessToken: string,
  videoId: string,
  file: ArrayBuffer,
  mimeType: string
): Promise<void> {
  const response = await youtubeFetch(
    `${YOUTUBE_UPLOAD_BASE}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: file,
    }
  );

  if (!response.ok) {
    throw new YouTubeApiError(
      "YouTube rejected the thumbnail.",
      response.status
    );
  }
}

/** Flips an already-uploaded video to public immediately. */
export async function publishVideoNow(
  accessToken: string,
  videoId: string
): Promise<void> {
  const response = await youtubeFetch(
    `${YOUTUBE_API_BASE}/videos?part=status`,
    accessToken,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: videoId,
        status: { privacyStatus: "public" },
      }),
    }
  );

  if (!response.ok) {
    throw new YouTubeApiError(
      "YouTube refused to publish the video.",
      response.status
    );
  }
}

/*
 * The revoke helper was removed deliberately.
 *
 * Google treats this project's incremental grants as one combined
 * authorization, so revoking the YouTube token would also drop the Calendar
 * scopes. Both disconnects are local operations. Provider-side revocation, if
 * ever wanted, must be a separate explicit action that disconnects both.
 */

export { encryptSecret, decryptSecret };

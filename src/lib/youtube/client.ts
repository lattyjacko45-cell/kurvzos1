import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  GOOGLE_TOKEN_URL,
  GOOGLE_REVOKE_URL,
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

  constructor(message: string, status: number) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
  }
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
    // Deliberately not including the body: it can echo request parameters.
    throw new YouTubeApiError(
      "Google rejected the token request.",
      response.status
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
  return refreshAccessToken(refreshToken);
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

export async function fetchOwnChannel(
  accessToken: string
): Promise<ChannelSummary> {
  const response = await youtubeFetch(
    `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`,
    accessToken
  );

  if (!response.ok) {
    throw new YouTubeApiError(
      "Could not read the YouTube channel for this Google account.",
      response.status
    );
  }

  const payload = (await response.json()) as {
    items?: Array<{ id: string; snippet?: { title?: string } }>;
  };

  const channel = payload.items?.[0];
  if (!channel) {
    throw new YouTubeApiError(
      "This Google account has no YouTube channel.",
      404
    );
  }

  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? "YouTube channel",
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
export async function createResumableUploadSession(
  accessToken: string,
  input: ResumableSessionInput
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
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new YouTubeApiError(
      "YouTube refused to start the upload session.",
      response.status
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

export interface VideoStatus {
  uploadStatus: string | null;
  privacyStatus: string | null;
  processingStatus: string | null;
  publishAt: string | null;
  failureReason: string | null;
}

export async function fetchVideoStatus(
  accessToken: string,
  videoId: string
): Promise<VideoStatus | null> {
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
      };
      processingDetails?: { processingStatus?: string };
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

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }).toString(),
    cache: "no-store",
  }).catch(() => {
    // Revocation is best-effort; local deletion is what matters.
  });
}

export { encryptSecret, decryptSecret };

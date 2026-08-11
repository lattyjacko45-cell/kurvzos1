import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  DRIVE_API_BASE,
  DRIVE_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  getDriveRedirectUri,
  requireDriveEnv,
} from "@/lib/drive/config";
import {
  buildSearchQuery,
  normalizeDriveFiles,
  type DriveFile,
  type RawDriveFile,
} from "@/lib/drive/normalize";

/**
 * Google Drive access — metadata, read only.
 *
 * There is no write path in this module by construction: no create, update,
 * copy, move, trash or delete call exists here, so no code path can modify the
 * user's Drive.
 *
 * File content is impossible rather than merely avoided. The granted scope is
 * `drive.metadata.readonly`, under which Google will not serve file bytes at
 * all — `alt=media` is refused. No download, export or thumbnail fetch can be
 * added later without also widening the scope, which is a visible change.
 */

export class DriveApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "DriveApiError";
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

export function buildDriveAuthorizationUrl(state: string): string {
  const env = requireDriveEnv();

  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: getDriveRedirectUri(env.appUrl),
    response_type: "code",
    // The userinfo.email scope is what lets the connection card name the
    // connected account. It is non-sensitive and carries no Drive access.
    scope: [...DRIVE_SCOPES, "https://www.googleapis.com/auth/userinfo.email"].join(" "),
    access_type: "offline",
    prompt: "consent",
    // Incremental authorization: adds Drive alongside any existing YouTube,
    // Calendar and Gmail grants rather than replacing them.
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

    throw new DriveApiError(
      "Google rejected the token request.",
      response.status,
      readGoogleErrorCode(payload)
    );
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeDriveCode(
  code: string
): Promise<GoogleTokenResponse> {
  const env = requireDriveEnv();

  return postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: getDriveRedirectUri(env.appUrl),
    grant_type: "authorization_code",
  });
}

/**
 * Fresh access token from the stored Drive refresh token.
 *
 * The refresh token is decrypted here and nowhere else, and only the
 * short-lived access token leaves this function — never to a client, never to
 * a log.
 */
export async function getDriveAccessToken(profileId: string): Promise<string> {
  const connection = await prisma.driveConnection.findUnique({
    where: { profileId },
    select: { encryptedRefreshToken: true },
  });

  if (!connection) {
    throw new DriveApiError("No Google Drive account is connected.", 428);
  }

  const env = requireDriveEnv();
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
    throw new DriveApiError(
      "Your Google Drive authorization has expired. Reconnect Drive.",
      401
    );
  }
}

async function failFrom(
  response: Response,
  message: string
): Promise<DriveApiError> {
  const payload: unknown = await response.json().catch(() => null);

  return new DriveApiError(
    message,
    response.status,
    readGoogleErrorCode(payload)
  );
}

/** The connected account address, for the connection card. */
export async function fetchDriveAccount(
  accessToken: string
): Promise<{ accountEmail: string }> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await failFrom(response, "Could not read the Google account.");
  }

  const payload = (await response.json()) as { email?: string };

  return { accountEmail: payload.email ?? "Connected account" };
}

/**
 * The only file fields we ask Google for.
 *
 * Owners, permissions, sharing state, parents, thumbnails and description are
 * not requested, so they never reach this process. `size` is metadata, not
 * content — Google reports the byte count without serving the bytes.
 */
const FILE_FIELDS =
  "nextPageToken, incompleteSearch, files(id, name, mimeType, modifiedTime, webViewLink, size, trashed)";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

export interface DriveListResult {
  files: DriveFile[];
  /** Google set this when the corpora was too large to search completely. */
  incompleteSearch: boolean;
}

/**
 * Recent files from the user's Drive, newest first, normalized.
 *
 * One request, no pagination loop: Phase 1 shows a recent-activity list, not a
 * full sync. `orderBy=modifiedTime desc` follows Google's own guidance to
 * prefer `modifiedTime` over `createdTime` for time-ordered queries on large
 * collections.
 */
export async function listRecentFiles(
  accessToken: string,
  options: { search?: string | null; pageSize?: number } = {}
): Promise<DriveListResult> {
  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );

  const params = new URLSearchParams({
    q: buildSearchQuery(options.search),
    pageSize: String(pageSize),
    orderBy: "modifiedTime desc",
    fields: FILE_FIELDS,
    // Restrict to the user's Drive space; appDataFolder and photos are not
    // business assets and are not ours to surface.
    spaces: "drive",
    // Shared drives are legitimate business storage, so include them.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
  });

  const response = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await failFrom(response, "Could not read Drive files.");
  }

  const payload = (await response.json()) as {
    files?: RawDriveFile[];
    incompleteSearch?: boolean;
  };

  return {
    files: normalizeDriveFiles(payload.files ?? []),
    incompleteSearch: payload.incompleteSearch === true,
  };
}

/*
 * There is deliberately no revoke helper in this module.
 *
 * Drive, Gmail, Calendar and YouTube are authorised through one Google Cloud
 * project with include_granted_scopes=true, which Google treats as a single
 * combined authorization. Revoking here would drop all four. Disconnecting
 * Drive is a local operation — see /api/drive/disconnect.
 */

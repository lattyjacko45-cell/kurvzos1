import { cache as cacheRequest } from "react";

import { prisma } from "@/lib/prisma";
import {
  DriveApiError,
  getDriveAccessToken,
  listRecentFiles,
} from "@/lib/drive/client";
import { DriveNotConfiguredError } from "@/lib/drive/config";
import { classifyDriveReadFailure } from "@/lib/drive/read-failure";
import type { DriveFile, DriveReadState } from "@/lib/drive/normalize";

export type { DriveReadState };

/**
 * Cached Drive reads.
 *
 * Same arrangement as the Gmail and Calendar readers. Deliberate limits for
 * Internal Alpha:
 *  - In-process only. Does not survive a restart, not shared across instances.
 *  - No polling and no background refresh; a read happens only when a page or
 *    route asks and the cache is cold.
 *  - Nothing is persisted. File metadata lives in memory for the TTL and is
 *    never written to the database.
 *  - `invalidateDriveFiles` lets connect/disconnect drop it immediately rather
 *    than serving a stale connection state.
 *
 * The cache key includes the search term, so searching does not poison the
 * unfiltered listing and vice versa.
 */

const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  files: DriveFile[];
  incompleteSearch: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface DriveFilesResult {
  state: DriveReadState;
  files: DriveFile[];
  /** The connected account, when there is one. Display only. */
  accountEmail: string | null;
  /** Google could not search the whole corpus; results may be partial. */
  incompleteSearch: boolean;
  /** Safe identifier only; never a message from Google. */
  reason?: string;
}

function cacheKey(profileId: string, search: string | null): string {
  return `${profileId}::${search ?? ""}`;
}

/** Drops every cached listing for a profile, whatever the search term. */
export function invalidateDriveFiles(profileId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${profileId}::`)) cache.delete(key);
  }
}

async function readDriveFilesForProfile(
  profileId: string,
  search: string | null,
  force: boolean
): Promise<DriveFilesResult> {
  const connection = await prisma.driveConnection.findUnique({
    where: { profileId },
    select: { accountEmail: true },
  });

  if (!connection) {
    invalidateDriveFiles(profileId);
    return {
      state: "not_connected",
      files: [],
      accountEmail: null,
      incompleteSearch: false,
    };
  }

  const key = cacheKey(profileId, search);
  const cached = cache.get(key);
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  if (fresh && !force) {
    return {
      state: "connected",
      files: cached.files,
      accountEmail: connection.accountEmail,
      incompleteSearch: cached.incompleteSearch,
    };
  }

  try {
    const accessToken = await getDriveAccessToken(profileId);
    const { files, incompleteSearch } = await listRecentFiles(accessToken, {
      search,
    });

    cache.set(key, { files, incompleteSearch, fetchedAt: Date.now() });

    // Counts only — never a filename, id, link or token.
    console.info("[drive] files read", {
      stage: "list_files",
      status: 200,
      reason: "ok",
      fileCount: files.length,
    });

    return {
      state: "connected",
      files,
      accountEmail: connection.accountEmail,
      incompleteSearch,
    };
  } catch (error) {
    const status = error instanceof DriveApiError ? error.status : undefined;

    /**
     * Classification lives in `read-failure.ts` so the expected-vs-unexpected
     * split — and specifically the "do not log this" decision — is covered
     * by its own dependency-free tests rather than living only inline here.
     *
     * An unconfigured integration (missing client id/secret, encryption key,
     * or app URL) and an expired-or-scope-insufficient authorization (401 /
     * 403, "reconnect required") are both expected states an inbox read can
     * land in — a workspace with no Drive connection is not a bug. Only a
     * failure outside those cases is genuinely unexpected and worth a real
     * `console.error` an operator should see.
     */
    const classification = classifyDriveReadFailure({
      notConfigured: error instanceof DriveNotConfiguredError,
      isApiError: error instanceof DriveApiError,
      status,
      errorCode: error instanceof DriveApiError ? error.errorCode : undefined,
    });

    if (classification.shouldLog) {
      console.error("[drive] files read failed", {
        stage: "list_files",
        status: status ?? null,
        reason: classification.reason,
        fileCount: 0,
      });
    }

    if (classification.state === "not_connected") {
      // Drive is not configured for this deployment — degrade exactly like a
      // profile with no Drive connection at all, rather than serving a stale
      // cache that can no longer be refreshed.
      return {
        state: "not_connected",
        files: [],
        accountEmail: connection.accountEmail,
        incompleteSearch: false,
        reason: classification.reason,
      };
    }

    return {
      state: classification.state,
      // Serve a stale page rather than blanking the list on a transient fault.
      files: cached?.files ?? [],
      accountEmail: connection.accountEmail,
      incompleteSearch: cached?.incompleteSearch ?? false,
      reason: classification.reason,
    };
  }
}

const getRequestCachedDriveFiles = cacheRequest(
  (profileId: string, search: string | null) =>
    readDriveFilesForProfile(profileId, search, false)
);

export function getDriveFilesForProfile(
  profileId: string,
  options: { search?: string | null; force?: boolean } = {}
): Promise<DriveFilesResult> {
  const search = options.search?.trim() || null;

  return options.force
    ? readDriveFilesForProfile(profileId, search, true)
    : getRequestCachedDriveFiles(profileId, search);
}

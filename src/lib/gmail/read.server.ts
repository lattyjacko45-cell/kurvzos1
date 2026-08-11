import { cache as cacheRequest } from "react";

import { prisma } from "@/lib/prisma";
import {
  GmailApiError,
  getGmailAccessToken,
  listRecentInboxMessages,
} from "@/lib/gmail/client";
import type { GmailMessage, GmailReadState } from "@/lib/gmail/normalize";

export type { GmailReadState };

/**
 * Cached Gmail reads.
 *
 * Same arrangement as the Calendar reader, for the same reason: a read costs
 * one list call plus one metadata call per message, so an unguarded read on
 * every render would be expensive and would burn quota. The first read in a
 * window hits Google; the rest come from memory.
 *
 * Deliberate limits for Internal Alpha:
 *  - In-process only. It does not survive a restart and is not shared across
 *    instances — fine for a single local server, and the thing to replace when
 *    this runs behind more than one process.
 *  - No polling. Nothing refreshes in the background; a read happens only when
 *    a page or route asks and the cache is cold.
 *  - `invalidateInbox` lets connect/disconnect drop it immediately rather than
 *    serving a stale connection state.
 */

const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  messages: GmailMessage[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface InboxResult {
  state: GmailReadState;
  messages: GmailMessage[];
  /** The connected mailbox, when there is one. Display only. */
  emailAddress: string | null;
  /** Safe identifier only; never a message from Google. */
  reason?: string;
}

export function invalidateInbox(profileId: string): void {
  cache.delete(profileId);
}

async function readInboxForProfile(
  profileId: string,
  force: boolean
): Promise<InboxResult> {
  const connection = await prisma.gmailConnection.findUnique({
    where: { profileId },
    select: { emailAddress: true },
  });

  if (!connection) {
    cache.delete(profileId);
    return { state: "not_connected", messages: [], emailAddress: null };
  }

  const cached = cache.get(profileId);
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  if (fresh && !force) {
    return {
      state: "connected",
      messages: cached.messages,
      emailAddress: connection.emailAddress,
    };
  }

  try {
    const accessToken = await getGmailAccessToken(profileId);
    const messages = await listRecentInboxMessages(accessToken);

    cache.set(profileId, { messages, fetchedAt: Date.now() });

    // Counts only — never a subject, sender, snippet, id or token.
    console.info("[gmail] inbox read", {
      stage: "list_messages",
      status: 200,
      reason: "ok",
      messageCount: messages.length,
    });

    return {
      state: "connected",
      messages,
      emailAddress: connection.emailAddress,
    };
  } catch (error) {
    const status = error instanceof GmailApiError ? error.status : undefined;
    const reason =
      error instanceof GmailApiError
        ? (error.errorCode ?? "request_failed")
        : "unexpected";

    console.error("[gmail] inbox read failed", {
      stage: "list_messages",
      status: status ?? null,
      reason,
      messageCount: 0,
    });

    /**
     * 403 is not treated as "reconnect" the way it is for Calendar.
     *
     * A user who connected before Gmail existed in KurvzOS holds a valid Google
     * grant without the Gmail scope, and Google answers that with 403
     * insufficient permissions — which is exactly the "authorized, but not for
     * Gmail" case. Sending them to reconnect is the correct, graceful outcome.
     */
    const needsReconnect = status === 401 || status === 403;

    return {
      state: needsReconnect ? "reconnect_required" : "error",
      // Serve a stale page rather than blanking the inbox on a transient fault.
      messages: cached?.messages ?? [],
      emailAddress: connection.emailAddress,
      reason,
    };
  }
}

const getRequestCachedInbox = cacheRequest((profileId: string) =>
  readInboxForProfile(profileId, false)
);

export function getInboxForProfile(
  profileId: string,
  options: { force?: boolean } = {}
): Promise<InboxResult> {
  return options.force
    ? readInboxForProfile(profileId, true)
    : getRequestCachedInbox(profileId);
}

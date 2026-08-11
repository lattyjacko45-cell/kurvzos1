/**
 * Gmail message normalization.
 *
 * Deliberately dependency-free: no Prisma, no Next, no `@/` alias, no network.
 * That keeps it directly executable by `node --experimental-strip-types` so the
 * branch tests in `normalize.test.mjs` run without a test framework — the same
 * arrangement as `lib/youtube/status-map.ts`. Keep it that way.
 *
 * This module is also the privacy boundary. `normalizeGmailMessage` copies a
 * fixed allowlist of fields, so message bodies, attachments, recipient lists,
 * cc/bcc and raw MIME never leave the Gmail layer even if a future caller asks
 * for a richer `format`.
 */

/**
 * The only message shape allowed out of the Gmail integration.
 *
 * Shaped for Harper: every field is a plain scalar that a prompt or a
 * deterministic rule can consume directly, with no nested Google types and no
 * Date objects to serialize. Nothing here is analysed yet — Phase 1 only
 * displays it.
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  /** Display name when the sender provided one, otherwise the bare address. */
  from: string;
  /** The address alone, or null when the header could not be parsed. */
  fromAddress: string | null;
  subject: string;
  snippet: string;
  /** ISO 8601 instant. */
  receivedAt: string;
  isUnread: boolean;
  gmailUrl: string;
}

/** The raw fields we read. Everything else in the payload is ignored. */
export interface RawGmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  /** Epoch milliseconds, as a string. Gmail's own receive timestamp. */
  internalDate?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
}

export const NO_SUBJECT = "(no subject)";
export const UNKNOWN_SENDER = "Unknown sender";

/**
 * Outcome of a Gmail read.
 *
 * Declared here rather than in `read.server.ts` so the connection card — a
 * client component — can type its prop without importing a module that pulls in
 * Prisma. `import type` would be erased anyway, but keeping the server module
 * out of the client import graph entirely removes the question.
 */
export type GmailReadState =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error";

/**
 * The named entities Gmail actually emits in a snippet.
 *
 * Deliberately a short allowlist rather than the full HTML5 table: this decodes
 * text for display, it is not an HTML parser, and an unrecognised entity is
 * left exactly as it arrived rather than guessed at.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Named, decimal or hexadecimal. Matched in one pass — see below. */
const ENTITY_PATTERN = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;

/**
 * Decodes HTML entities in a plain-text string.
 *
 * Gmail HTML-escapes `snippet`, so an apostrophe arrives as `&#39;` and renders
 * literally as "couldn&#39;t" once React escapes it again for output.
 *
 * This produces a *string*, never markup. Nothing downstream sets innerHTML —
 * React escapes the result on render, so decoding `&lt;` back to `<` cannot
 * introduce an injection: it becomes the literal character `<` in a text node.
 *
 * One regex pass, deliberately. Chained `.replace()` calls would decode their
 * own output, so `&amp;#39;` — an escaped, literal "&#39;" — would wrongly
 * collapse to an apostrophe. Matching every entity once leaves it as `&#39;`.
 */
export function decodeHtmlEntities(value: string): string {
  if (!value.includes("&")) return value;

  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(
        isHex ? body.slice(2) : body.slice(1),
        isHex ? 16 : 10
      );

      if (!Number.isInteger(codePoint)) return match;
      // Outside Unicode, or a lone surrogate: String.fromCodePoint would throw
      // or produce a broken pair.
      if (codePoint < 0 || codePoint > 0x10ffff) return match;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
      // Control characters have no place in a preview line.
      if (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a) {
        return match;
      }

      return String.fromCodePoint(codePoint);
    }

    // hasOwnProperty, not a bare lookup: `&constructor;` would otherwise
    // resolve up the prototype chain to a function.
    const key = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)
      ? NAMED_ENTITIES[key]
      : match;
  });
}

/** Case-insensitive header lookup; Gmail does not guarantee casing. */
export function findHeader(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string
): string | null {
  if (!headers) return null;

  const target = name.toLowerCase();

  for (const header of headers) {
    if (header?.name?.toLowerCase() === target) {
      const value = header.value?.trim();
      if (value) return value;
    }
  }

  return null;
}

export interface ParsedSender {
  name: string;
  address: string | null;
}

/**
 * Splits a From header into a display name and an address.
 *
 * Handles the three shapes Gmail actually returns:
 *   "Jane Doe" <jane@example.com>
 *   Jane Doe <jane@example.com>
 *   jane@example.com
 *
 * Returns the address as the display name when no name was supplied, so the UI
 * never has to decide what to show.
 */
export function parseSender(raw: string | null): ParsedSender {
  if (!raw) return { name: UNKNOWN_SENDER, address: null };

  const trimmed = raw.trim();
  if (!trimmed) return { name: UNKNOWN_SENDER, address: null };

  const angled = trimmed.match(/^(.*)<([^<>]+)>\s*$/);

  if (angled) {
    const address = angled[2].trim() || null;
    const name = angled[1].trim().replace(/^"(.*)"$/, "$1").trim();

    return { name: name || address || UNKNOWN_SENDER, address };
  }

  // A bare address, or a name with no address at all.
  const looksLikeAddress = trimmed.includes("@") && !trimmed.includes(" ");

  return {
    name: trimmed.replace(/^"(.*)"$/, "$1").trim() || UNKNOWN_SENDER,
    address: looksLikeAddress ? trimmed : null,
  };
}

/**
 * Gmail's receive time.
 *
 * `internalDate` is preferred over the Date header: it is Gmail's own record of
 * when the message arrived, whereas Date is set by the sender and can be wrong
 * or deliberately forged. Falls back to Date, then to null.
 */
export function parseReceivedAt(
  internalDate: string | undefined,
  dateHeader: string | null
): string | null {
  if (internalDate) {
    const epochMs = Number(internalDate);

    if (Number.isFinite(epochMs) && epochMs > 0) {
      const parsed = new Date(epochMs);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

/** Deep link to the message in the Gmail web client. */
export function gmailMessageUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`;
}

/**
 * Maps one raw Gmail message onto the normalized shape.
 *
 * Returns null when the message cannot be represented honestly — no id, no
 * thread id, or no usable timestamp. A message with a missing subject or
 * snippet is still valid; those degrade to placeholders rather than dropping
 * the row.
 */
export function normalizeGmailMessage(
  raw: RawGmailMessage
): GmailMessage | null {
  if (!raw.id || !raw.threadId) return null;

  const headers = raw.payload?.headers;
  const receivedAt = parseReceivedAt(
    raw.internalDate,
    findHeader(headers, "Date")
  );

  if (!receivedAt) return null;

  const sender = parseSender(findHeader(headers, "From"));

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: sender.name,
    fromAddress: sender.address,
    subject: findHeader(headers, "Subject") ?? NO_SUBJECT,
    // Decoded before trimming so a leading or trailing &nbsp; is trimmed too.
    snippet: decodeHtmlEntities(raw.snippet ?? "").trim(),
    receivedAt,
    isUnread: (raw.labelIds ?? []).includes("UNREAD"),
    gmailUrl: gmailMessageUrl(raw.id),
  };
}

/**
 * Human-readable receive time.
 *
 * Lives here rather than in a component so both the server's first paint and
 * the browser's local-timezone correction format identically — the only thing
 * that differs between them is the zone the same function is given.
 */
export function formatMessageTimestamp(
  iso: string,
  timeZone?: string
): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Normalizes a batch, drops anything unrepresentable, and orders newest first.
 *
 * Gmail returns list order by internal date already, but the per-message
 * metadata calls resolve concurrently, so the sort here is what actually
 * guarantees the order the UI renders.
 */
export function normalizeGmailMessages(
  raw: RawGmailMessage[]
): GmailMessage[] {
  return raw
    .map(normalizeGmailMessage)
    .filter((message): message is GmailMessage => message !== null)
    .sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
}

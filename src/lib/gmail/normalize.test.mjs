/**
 * Branch tests for Gmail message normalization.
 *
 * Run with:  npm test
 *
 * A .mjs file rather than .ts for the same reason as status-map.test.mjs: Node's
 * type stripping needs the explicit "./normalize.ts" specifier, and permitting
 * that in TypeScript would require allowImportingTsExtensions, which changes how
 * the Prisma generator emits its own imports. Keeping the test outside the
 * TypeScript program avoids that entirely.
 *
 * Uses Node's built-in test runner — no dependencies added. That only works
 * because normalize.ts is free of Prisma, Next and "@/" alias imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decodeHtmlEntities,
  findHeader,
  formatMessageTimestamp,
  gmailMessageUrl,
  normalizeGmailMessage,
  normalizeGmailMessages,
  parseReceivedAt,
  parseSender,
  NO_SUBJECT,
  UNKNOWN_SENDER,
} from "./normalize.ts";

/** 2026-08-11T09:42:00.000Z */
const EPOCH_MS = "1786441320000";
const EPOCH_ISO = new Date(Number(EPOCH_MS)).toISOString();

function message(over = {}) {
  return {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX"],
    snippet: "A short preview of the message.",
    internalDate: EPOCH_MS,
    payload: {
      headers: [
        { name: "From", value: "Jane Doe <jane@example.com>" },
        { name: "Subject", value: "Quarterly numbers" },
        { name: "Date", value: "Tue, 11 Aug 2026 09:42:00 +0000" },
      ],
    },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// findHeader
// ---------------------------------------------------------------------------

test("findHeader matches case-insensitively", () => {
  const headers = [{ name: "SUBJECT", value: "Hello" }];

  assert.equal(findHeader(headers, "Subject"), "Hello");
  assert.equal(findHeader(headers, "subject"), "Hello");
});

test("findHeader returns null for missing, empty and absent header lists", () => {
  assert.equal(findHeader([{ name: "From", value: "  " }], "From"), null);
  assert.equal(findHeader([], "From"), null);
  assert.equal(findHeader(undefined, "From"), null);
});

// ---------------------------------------------------------------------------
// decodeHtmlEntities
// ---------------------------------------------------------------------------

test("decodes the entities Gmail actually sends in snippets", () => {
  assert.equal(decodeHtmlEntities("couldn&#39;t"), "couldn't");
  assert.equal(decodeHtmlEntities("I&#39;ve"), "I've");
  assert.equal(decodeHtmlEntities("Ben &amp; Jerry"), "Ben & Jerry");
  assert.equal(decodeHtmlEntities("say &quot;hello&quot;"), 'say "hello"');
  assert.equal(decodeHtmlEntities("2 &lt; 3"), "2 < 3");
  assert.equal(decodeHtmlEntities("3 &gt; 2"), "3 > 2");
  assert.equal(decodeHtmlEntities("it&apos;s"), "it's");
});

test("decodes hexadecimal and named entities, case-insensitively", () => {
  assert.equal(decodeHtmlEntities("it&#x27;s"), "it's");
  assert.equal(decodeHtmlEntities("it&#X27;s"), "it's");
  assert.equal(decodeHtmlEntities("A&AMP;B"), "A&B");
});

test("decodes several entities in one string", () => {
  assert.equal(
    decodeHtmlEntities("Q&amp;A: couldn&#39;t say &quot;yes&quot;"),
    `Q&A: couldn't say "yes"`
  );
});

test("does not double-decode: an escaped entity stays literal", () => {
  // "&amp;#39;" is the sender writing "&#39;" as text. One pass keeps it.
  assert.equal(decodeHtmlEntities("&amp;#39;"), "&#39;");
  assert.equal(decodeHtmlEntities("&amp;amp;"), "&amp;");
});

test("leaves unrecognised and malformed entities untouched", () => {
  assert.equal(decodeHtmlEntities("&unknownentity;"), "&unknownentity;");
  assert.equal(decodeHtmlEntities("a & b"), "a & b");
  assert.equal(decodeHtmlEntities("&#;"), "&#;");
  assert.equal(decodeHtmlEntities("100% &"), "100% &");
});

test("does not resolve prototype members as entities", () => {
  // A bare map lookup would return Object.prototype.constructor here.
  assert.equal(decodeHtmlEntities("&constructor;"), "&constructor;");
  assert.equal(decodeHtmlEntities("&__proto__;"), "&__proto__;");
  assert.equal(decodeHtmlEntities("&toString;"), "&toString;");
});

test("rejects code points that are invalid, surrogate or control", () => {
  assert.equal(decodeHtmlEntities("&#1114112;"), "&#1114112;"); // > 0x10FFFF
  assert.equal(decodeHtmlEntities("&#xD800;"), "&#xD800;"); // lone surrogate
  assert.equal(decodeHtmlEntities("&#0;"), "&#0;"); // NUL
  assert.equal(decodeHtmlEntities("&#7;"), "&#7;"); // BEL
});

test("decoding produces text, never markup", () => {
  // React escapes on render, so a decoded angle bracket is a literal
  // character in a text node — this asserts we hand back a plain string.
  const decoded = decodeHtmlEntities("&lt;script&gt;alert(1)&lt;/script&gt;");

  assert.equal(typeof decoded, "string");
  assert.equal(decoded, "<script>alert(1)</script>");
});

test("a string with no ampersand is returned unchanged", () => {
  assert.equal(decodeHtmlEntities("plain preview text"), "plain preview text");
  assert.equal(decodeHtmlEntities(""), "");
});

// ---------------------------------------------------------------------------
// parseSender
// ---------------------------------------------------------------------------

test("parseSender splits a quoted display name from the address", () => {
  const result = parseSender('"Jane Doe" <jane@example.com>');

  assert.equal(result.name, "Jane Doe");
  assert.equal(result.address, "jane@example.com");
});

test("parseSender splits an unquoted display name from the address", () => {
  const result = parseSender("Jane Doe <jane@example.com>");

  assert.equal(result.name, "Jane Doe");
  assert.equal(result.address, "jane@example.com");
});

test("parseSender falls back to the address when there is no display name", () => {
  const result = parseSender("<jane@example.com>");

  assert.equal(result.name, "jane@example.com");
  assert.equal(result.address, "jane@example.com");
});

test("parseSender handles a bare address", () => {
  const result = parseSender("jane@example.com");

  assert.equal(result.name, "jane@example.com");
  assert.equal(result.address, "jane@example.com");
});

test("parseSender reports an unknown sender for null and empty input", () => {
  assert.deepEqual(parseSender(null), {
    name: UNKNOWN_SENDER,
    address: null,
  });
  assert.deepEqual(parseSender("   "), {
    name: UNKNOWN_SENDER,
    address: null,
  });
});

test("parseSender does not invent an address from a name-only header", () => {
  const result = parseSender("Accounts Team");

  assert.equal(result.name, "Accounts Team");
  assert.equal(result.address, null);
});

// ---------------------------------------------------------------------------
// parseReceivedAt
// ---------------------------------------------------------------------------

test("parseReceivedAt prefers internalDate over the Date header", () => {
  // Gmail's own receive time wins: the Date header is sender-controlled.
  const result = parseReceivedAt(EPOCH_MS, "Tue, 01 Jan 1990 00:00:00 +0000");

  assert.equal(result, EPOCH_ISO);
});

test("parseReceivedAt falls back to the Date header", () => {
  const result = parseReceivedAt(undefined, "Tue, 11 Aug 2026 09:42:00 +0000");

  assert.equal(result, EPOCH_ISO);
});

test("parseReceivedAt rejects unusable values", () => {
  assert.equal(parseReceivedAt(undefined, null), null);
  assert.equal(parseReceivedAt("not-a-number", null), null);
  assert.equal(parseReceivedAt("0", null), null);
  assert.equal(parseReceivedAt(undefined, "garbage"), null);
});

// ---------------------------------------------------------------------------
// normalizeGmailMessage
// ---------------------------------------------------------------------------

test("normalizes a complete message", () => {
  const result = normalizeGmailMessage(message());

  assert.deepEqual(result, {
    id: "m1",
    threadId: "t1",
    from: "Jane Doe",
    fromAddress: "jane@example.com",
    subject: "Quarterly numbers",
    snippet: "A short preview of the message.",
    receivedAt: EPOCH_ISO,
    isUnread: false,
    gmailUrl: gmailMessageUrl("m1"),
  });
});

test("UNREAD label sets isUnread", () => {
  const result = normalizeGmailMessage(
    message({ labelIds: ["INBOX", "UNREAD"] })
  );

  assert.equal(result?.isUnread, true);
});

test("a missing labelIds array is treated as read, not a crash", () => {
  const result = normalizeGmailMessage(message({ labelIds: undefined }));

  assert.equal(result?.isUnread, false);
});

test("a missing subject degrades to a placeholder rather than dropping", () => {
  const result = normalizeGmailMessage(
    message({
      payload: { headers: [{ name: "From", value: "jane@example.com" }] },
    })
  );

  assert.equal(result?.subject, NO_SUBJECT);
});

test("a missing snippet becomes an empty string", () => {
  const result = normalizeGmailMessage(message({ snippet: undefined }));

  assert.equal(result?.snippet, "");
});

test("REGRESSION: snippet entities are decoded during normalization", () => {
  // Gmail HTML-escapes snippet, so this arrived on screen as "couldn&#39;t".
  const result = normalizeGmailMessage(
    message({ snippet: "I&#39;ve checked and couldn&#39;t find it &amp; gave up" })
  );

  assert.equal(result?.snippet, "I've checked and couldn't find it & gave up");
});

test("snippet decoding still trims, including a decoded &nbsp;", () => {
  const result = normalizeGmailMessage(
    message({ snippet: "&nbsp; padded preview &nbsp;" })
  );

  assert.equal(result?.snippet, "padded preview");
});

test("subject is left exactly as Gmail sent it", () => {
  // Only snippet is HTML-escaped by the API. The Subject header is raw, so
  // decoding it would corrupt a subject that legitimately contains "&amp;".
  const result = normalizeGmailMessage(
    message({
      payload: {
        headers: [
          { name: "From", value: "jane@example.com" },
          { name: "Subject", value: "Invoice &amp; receipt" },
        ],
      },
    })
  );

  assert.equal(result?.subject, "Invoice &amp; receipt");
});

test("a message with no id or threadId is dropped", () => {
  assert.equal(normalizeGmailMessage(message({ id: undefined })), null);
  assert.equal(normalizeGmailMessage(message({ threadId: undefined })), null);
});

test("a message with no usable timestamp is dropped", () => {
  const result = normalizeGmailMessage(
    message({
      internalDate: undefined,
      payload: { headers: [{ name: "From", value: "jane@example.com" }] },
    })
  );

  assert.equal(result, null);
});

test("normalization never copies fields outside the allowlist", () => {
  // Body, recipients and raw MIME must not survive normalization even if a
  // future caller asks Google for a richer format.
  const result = normalizeGmailMessage(
    message({
      raw: "SGVsbG8gd29ybGQ=",
      payload: {
        body: { data: "c2VjcmV0" },
        parts: [{ body: { data: "c2VjcmV0" } }],
        headers: [
          { name: "From", value: "Jane Doe <jane@example.com>" },
          { name: "Subject", value: "Quarterly numbers" },
          { name: "To", value: "latoya@example.com" },
          { name: "Bcc", value: "hidden@example.com" },
        ],
      },
    })
  );

  const serialized = JSON.stringify(result);

  assert.ok(!serialized.includes("c2VjcmV0"), "body data leaked");
  assert.ok(!serialized.includes("SGVsbG8"), "raw MIME leaked");
  assert.ok(!serialized.includes("latoya@example.com"), "To header leaked");
  assert.ok(!serialized.includes("hidden@example.com"), "Bcc header leaked");

  assert.deepEqual(Object.keys(result ?? {}).sort(), [
    "from",
    "fromAddress",
    "gmailUrl",
    "id",
    "isUnread",
    "receivedAt",
    "snippet",
    "subject",
    "threadId",
  ]);
});

// ---------------------------------------------------------------------------
// normalizeGmailMessages
// ---------------------------------------------------------------------------

test("a batch is ordered newest first and unusable entries are dropped", () => {
  const older = String(Number(EPOCH_MS) - 60_000);
  const newer = String(Number(EPOCH_MS) + 60_000);

  const result = normalizeGmailMessages([
    message({ id: "old", internalDate: older }),
    message({ id: "broken", threadId: undefined }),
    message({ id: "new", internalDate: newer }),
    message({ id: "mid" }),
  ]);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["new", "mid", "old"]
  );
});

test("an empty batch normalizes to an empty list", () => {
  assert.deepEqual(normalizeGmailMessages([]), []);
});

// ---------------------------------------------------------------------------
// gmailMessageUrl / formatMessageTimestamp
// ---------------------------------------------------------------------------

test("gmailMessageUrl points at the Gmail web client and escapes the id", () => {
  assert.equal(
    gmailMessageUrl("abc123"),
    "https://mail.google.com/mail/u/0/#all/abc123"
  );
  assert.ok(gmailMessageUrl("a/b").endsWith("a%2Fb"));
});

test("formatMessageTimestamp renders a stable label for a given zone", () => {
  assert.equal(formatMessageTimestamp(EPOCH_ISO, "UTC"), "Aug 11, 9:42 AM");
});

test("formatMessageTimestamp returns an empty string for an unparseable value", () => {
  assert.equal(formatMessageTimestamp("garbage"), "");
});

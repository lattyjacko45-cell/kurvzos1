/**
 * Branch tests for Gmail failure classification.
 *
 * Run with:  npm test
 *
 * A .mjs file for the same reason as the other Gmail tests: Node's type
 * stripping needs the explicit "./failure.ts" specifier, and permitting that in
 * TypeScript would require allowImportingTsExtensions, which changes how the
 * Prisma generator emits its own imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GMAIL_FAILURE_HINTS,
  classifyGmailFailure,
  isGmailFailureReason,
} from "./failure.ts";

// ---------------------------------------------------------------------------
// Google's own reason wins
// ---------------------------------------------------------------------------

test("a disabled Gmail API is identified from Google's reason", () => {
  assert.equal(
    classifyGmailFailure(403, "accessNotConfigured"),
    "gmail_api_disabled"
  );
  assert.equal(
    classifyGmailFailure(403, "SERVICE_DISABLED"),
    "gmail_api_disabled"
  );
});

test("an account with no mailbox is identified from failedPrecondition", () => {
  // Gmail's answer for a Workspace account with Gmail switched off. It arrives
  // as a 400, which would otherwise look like a generic client error.
  assert.equal(
    classifyGmailFailure(400, "failedPrecondition"),
    "no_gmail_mailbox"
  );
  assert.equal(
    classifyGmailFailure(400, "FAILED_PRECONDITION"),
    "no_gmail_mailbox"
  );
});

test("a scope shortfall is identified from Google's reason", () => {
  assert.equal(
    classifyGmailFailure(403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT"),
    "insufficient_permissions"
  );
  assert.equal(
    classifyGmailFailure(403, "insufficientPermissions"),
    "insufficient_permissions"
  );
});

test("quota exhaustion is identified from any of Google's rate reasons", () => {
  for (const reason of [
    "quotaExceeded",
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "dailyLimitExceeded",
  ]) {
    assert.equal(classifyGmailFailure(429, reason), "quota_exceeded");
  }
});

test("Google's reason outranks the HTTP status", () => {
  // A 403 would fall back to insufficient_permissions, but the reason is more
  // specific and must win.
  assert.equal(
    classifyGmailFailure(403, "accessNotConfigured"),
    "gmail_api_disabled"
  );
});

// ---------------------------------------------------------------------------
// Status-only fallbacks
// ---------------------------------------------------------------------------

test("status alone still yields a useful classification", () => {
  assert.equal(classifyGmailFailure(401, undefined), "auth_error");
  assert.equal(classifyGmailFailure(403, undefined), "insufficient_permissions");
  assert.equal(classifyGmailFailure(429, undefined), "quota_exceeded");
  assert.equal(classifyGmailFailure(400, undefined), "no_gmail_mailbox");
  assert.equal(classifyGmailFailure(500, undefined), "http_error");
});

test("an unrecognised Google reason falls back to the status", () => {
  assert.equal(
    classifyGmailFailure(403, "somethingBrandNew"),
    "insufficient_permissions"
  );
});

test("no status and no reason is unexpected, not a crash", () => {
  assert.equal(classifyGmailFailure(undefined, undefined), "unexpected");
});

// ---------------------------------------------------------------------------
// The value is always safe to put in a URL and a log
// ---------------------------------------------------------------------------

test("every classification has a hint and is URL-safe", () => {
  const inputs = [
    [403, "accessNotConfigured"],
    [400, "failedPrecondition"],
    [403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT"],
    [401, "UNAUTHENTICATED"],
    [429, "quotaExceeded"],
    [500, undefined],
    [undefined, undefined],
  ];

  for (const [status, reason] of inputs) {
    const classified = classifyGmailFailure(status, reason);

    assert.ok(
      GMAIL_FAILURE_HINTS[classified],
      `no hint for ${classified}`
    );
    assert.equal(
      encodeURIComponent(classified),
      classified,
      `${classified} is not URL-safe`
    );
  }
});

test("classification never echoes Google's raw text", () => {
  // The whole point of the closed set: an address or free text in the payload
  // can never reach a redirect URL or a log line.
  const classified = classifyGmailFailure(
    403,
    "latoya@example.com is not permitted"
  );

  assert.equal(classified, "insufficient_permissions");
  assert.ok(!classified.includes("@"));
});

// ---------------------------------------------------------------------------
// isGmailFailureReason guards the hint lookup
// ---------------------------------------------------------------------------

test("isGmailFailureReason accepts only members of the closed set", () => {
  assert.equal(isGmailFailureReason("gmail_api_disabled"), true);
  assert.equal(isGmailFailureReason("no_gmail_mailbox"), true);

  assert.equal(isGmailFailureReason("constructor"), false);
  assert.equal(isGmailFailureReason("__proto__"), false);
  assert.equal(isGmailFailureReason("anything-else"), false);
  assert.equal(isGmailFailureReason(undefined), false);
});

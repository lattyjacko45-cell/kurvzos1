/**
 * Tests for Drive read-failure classification.
 *
 * The bug this guards against: `/executive-team/harper` tripped the Next.js
 * dev error overlay with "[drive] files read failed {}" for a secondary
 * workspace with no Drive connection — an entirely expected state that should
 * degrade silently, not log as a real error.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyDriveReadFailure } from "./read-failure.ts";

// ---------------------------------------------------------------------------
// Expected, silent states — must never be logged
// ---------------------------------------------------------------------------

test("an unconfigured Drive integration is not_connected and is not logged", () => {
  const result = classifyDriveReadFailure({
    notConfigured: true,
    isApiError: false,
  });

  assert.equal(result.state, "not_connected");
  assert.equal(result.reason, "not_configured");
  assert.equal(result.shouldLog, false);
});

test("unconfigured wins even if a status happens to be present", () => {
  // Defensive: DriveNotConfiguredError never carries a status, but the
  // classification must not accidentally fall through to the generic bucket
  // if it ever did.
  const result = classifyDriveReadFailure({
    notConfigured: true,
    isApiError: false,
    status: 500,
  });

  assert.equal(result.state, "not_connected");
  assert.equal(result.shouldLog, false);
});

test("an expired authorization (401) needs reconnect and is not logged", () => {
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: true,
    status: 401,
    errorCode: "UNAUTHENTICATED",
  });

  assert.equal(result.state, "reconnect_required");
  assert.equal(result.reason, "UNAUTHENTICATED");
  assert.equal(result.shouldLog, false);
});

test("a scope shortfall (403) needs reconnect and is not logged", () => {
  // A profile authorized before Drive existed in KurvzOS holds a valid grant
  // without the Drive scope — Google answers that with 403, and it is the
  // "authorized, but not for Drive" case, not a bug.
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: true,
    status: 403,
    errorCode: "insufficientPermissions",
  });

  assert.equal(result.state, "reconnect_required");
  assert.equal(result.shouldLog, false);
});

test("401/403 without a Google error code still needs reconnect, reason falls back", () => {
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: true,
    status: 401,
    errorCode: undefined,
  });

  assert.equal(result.state, "reconnect_required");
  assert.equal(result.reason, "request_failed");
  assert.equal(result.shouldLog, false);
});

// ---------------------------------------------------------------------------
// Genuinely unexpected states — must still be logged
// ---------------------------------------------------------------------------

test("a 500 from the Drive API is a real error and is logged", () => {
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: true,
    status: 500,
    errorCode: "backendError",
  });

  assert.equal(result.state, "error");
  assert.equal(result.reason, "backendError");
  assert.equal(result.shouldLog, true);
});

test("a non-Drive-API error (e.g. a thrown network failure) is unexpected and is logged", () => {
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: false,
    status: undefined,
    errorCode: undefined,
  });

  assert.equal(result.state, "error");
  assert.equal(result.reason, "unexpected");
  assert.equal(result.shouldLog, true);
});

test("a Drive API error with no status and no code is still logged as an error", () => {
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: true,
    status: undefined,
    errorCode: undefined,
  });

  assert.equal(result.state, "error");
  assert.equal(result.reason, "request_failed");
  assert.equal(result.shouldLog, true);
});

test("429 rate limiting is a real error, not a reconnect case, and is logged", () => {
  const result = classifyDriveReadFailure({
    notConfigured: false,
    isApiError: true,
    status: 429,
    errorCode: "rateLimitExceeded",
  });

  assert.equal(result.state, "error");
  assert.equal(result.shouldLog, true);
});

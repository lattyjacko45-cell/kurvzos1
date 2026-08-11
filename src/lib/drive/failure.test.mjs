/**
 * Branch tests for Google Drive failure classification.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DRIVE_FAILURE_HINTS,
  classifyDriveFailure,
  isDriveFailureReason,
} from "./failure.ts";

test("a disabled Drive API is identified from Google's reason", () => {
  assert.equal(
    classifyDriveFailure(403, "accessNotConfigured"),
    "drive_api_disabled"
  );
  assert.equal(
    classifyDriveFailure(403, "SERVICE_DISABLED"),
    "drive_api_disabled"
  );
});

test("a scope shortfall is identified from Google's reason", () => {
  assert.equal(
    classifyDriveFailure(403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT"),
    "insufficient_permissions"
  );
  assert.equal(
    classifyDriveFailure(403, "insufficientPermissions"),
    "insufficient_permissions"
  );
  assert.equal(
    classifyDriveFailure(403, "insufficientFilePermissions"),
    "insufficient_permissions"
  );
});

test("rate limiting is identified from any of Google's quota reasons", () => {
  for (const reason of [
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "dailyLimitExceeded",
    "quotaExceeded",
  ]) {
    assert.equal(classifyDriveFailure(403, reason), "rate_limited");
  }
});

test("Google's reason outranks the HTTP status", () => {
  // A bare 403 falls back to insufficient_permissions; the reason is more
  // specific and must win.
  assert.equal(
    classifyDriveFailure(403, "accessNotConfigured"),
    "drive_api_disabled"
  );
  assert.equal(classifyDriveFailure(403, "quotaExceeded"), "rate_limited");
});

test("status alone still yields a useful classification", () => {
  assert.equal(classifyDriveFailure(401, undefined), "auth_error");
  assert.equal(classifyDriveFailure(403, undefined), "insufficient_permissions");
  assert.equal(classifyDriveFailure(429, undefined), "rate_limited");
  assert.equal(classifyDriveFailure(500, undefined), "http_error");
});

test("an unrecognised Google reason falls back to the status", () => {
  assert.equal(
    classifyDriveFailure(401, "somethingBrandNew"),
    "auth_error"
  );
});

test("no status and no reason is unexpected, not a crash", () => {
  assert.equal(classifyDriveFailure(undefined, undefined), "unexpected");
});

test("every classification has a hint and is URL-safe", () => {
  const inputs = [
    [403, "accessNotConfigured"],
    [403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT"],
    [401, "UNAUTHENTICATED"],
    [429, "rateLimitExceeded"],
    [500, undefined],
    [undefined, undefined],
  ];

  for (const [status, reason] of inputs) {
    const classified = classifyDriveFailure(status, reason);

    assert.ok(DRIVE_FAILURE_HINTS[classified], `no hint for ${classified}`);
    assert.equal(
      encodeURIComponent(classified),
      classified,
      `${classified} is not URL-safe`
    );
  }
});

test("classification never echoes Google's raw text", () => {
  const classified = classifyDriveFailure(
    403,
    "latoya@example.com cannot access file 1a2b3c"
  );

  assert.equal(classified, "insufficient_permissions");
  assert.ok(!classified.includes("@"));
});

test("isDriveFailureReason accepts only members of the closed set", () => {
  assert.equal(isDriveFailureReason("drive_api_disabled"), true);
  assert.equal(isDriveFailureReason("rate_limited"), true);

  assert.equal(isDriveFailureReason("constructor"), false);
  assert.equal(isDriveFailureReason("__proto__"), false);
  assert.equal(isDriveFailureReason("anything-else"), false);
  assert.equal(isDriveFailureReason(undefined), false);
});

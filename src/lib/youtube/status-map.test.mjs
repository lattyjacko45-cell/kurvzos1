/**
 * Branch tests for the YouTube → KurvzOS status mapping.
 *
 * Run with:  npm test
 *
 * Deliberately a .mjs file rather than .ts.
 *
 * Node's type stripping requires the explicit "./status-map.ts" specifier, and
 * TypeScript only permits that with `allowImportingTsExtensions`. Setting that
 * option changed how the Prisma client generator emits its own imports, so
 * every `prisma generate` rewrote all of src/generated/prisma with .ts
 * extensions and left the tree dirty. Keeping the test in plain ESM removes the
 * need for the option entirely: tsconfig only includes TypeScript sources, so
 * this file is outside the TypeScript program and its import specifier is
 * Node's problem alone.
 *
 * Uses Node's built-in test runner and type stripping — no dependencies added.
 * That is only possible because status-map.ts is free of Prisma, Next and "@/"
 * alias imports. Keep it that way.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { mapYouTubeStatus, parsePublishAt } from "./status-map.ts";

const NOW = new Date("2026-08-08T12:00:00.000Z");
const FUTURE = "2026-08-09T12:00:00.000Z";
const PAST = "2026-08-07T12:00:00.000Z";

/** Every field null; each test sets only what it is actually about. */
function facts(over = {}) {
  return {
    uploadStatus: null,
    processingStatus: null,
    privacyStatus: null,
    publishAt: null,
    failureReason: null,
    rejectionReason: null,
    processingFailureReason: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The reported bug
// ---------------------------------------------------------------------------

test("REGRESSION: processed + private + no publishAt is UPLOADED, not stuck on PROCESSING", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "succeeded",
      privacyStatus: "private",
    }),
    NOW
  );

  assert.equal(result.status, "UPLOADED");
  assert.equal(result.reason, "processed_private");
  assert.equal(result.errorMessage, null);
});

test("REGRESSION: uploadStatus 'processed' wins over a lagging processingStatus 'processing'", () => {
  // This is the exact shape that pinned items on PROCESSING forever: the old
  // mapping tested processingDetails before uploadStatus, so it re-stamped
  // PROCESSING on every refresh and the item could never leave that state.
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "processing",
      privacyStatus: "private",
    }),
    NOW
  );

  assert.equal(result.status, "UPLOADED");
  assert.notEqual(result.status, "PROCESSING");
});

// ---------------------------------------------------------------------------
// Active processing stays PROCESSING
// ---------------------------------------------------------------------------

test("uploaded but not yet processed stays PROCESSING", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "uploaded",
      processingStatus: "processing",
      privacyStatus: "private",
    }),
    NOW
  );

  assert.equal(result.status, "PROCESSING");
  assert.equal(result.reason, "awaiting_processing");
});

test("uploaded with a future publishAt still reports PROCESSING, not SCHEDULED", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "uploaded",
      processingStatus: "processing",
      privacyStatus: "private",
      publishAt: FUTURE,
    }),
    NOW
  );

  assert.equal(result.status, "PROCESSING");
});

test("missing uploadStatus falls back to processingDetails", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: null, processingStatus: "processing" }),
    NOW
  );

  assert.equal(result.status, "PROCESSING");
  assert.equal(result.reason, "processing_in_progress");
});

// ---------------------------------------------------------------------------
// Failure branches
// ---------------------------------------------------------------------------

test("rejected video is FAILED with the rejection reason spelled out", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: "rejected", rejectionReason: "copyright" }),
    NOW
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "rejected");
  assert.match(result.errorMessage ?? "", /copyright/i);
});

test("rejected with an unknown reason still fails, with a generic message", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: "rejected", rejectionReason: "somethingNew" }),
    NOW
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.errorMessage, "YouTube rejected the video.");
});

test("failed upload is FAILED with the upload failure reason", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: "failed", failureReason: "codec" }),
    NOW
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "upload_failed");
  assert.match(result.errorMessage ?? "", /codec/i);
});

test("deleted video is FAILED, never UPLOADED", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: "deleted", privacyStatus: "private" }),
    NOW
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "deleted");
});

test("failed processing is FAILED with the processing failure reason", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "failed",
      processingFailureReason: "transcodeFailed",
    }),
    NOW
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "processing_failed");
  assert.match(result.errorMessage ?? "", /transcode/i);
});

test("terminated processing is FAILED", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: "processed", processingStatus: "terminated" }),
    NOW
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "processing_terminated");
});

test("failure outranks a public privacyStatus", () => {
  const result = mapYouTubeStatus(
    facts({ uploadStatus: "rejected", privacyStatus: "public" }),
    NOW
  );

  assert.equal(result.status, "FAILED");
});

// ---------------------------------------------------------------------------
// Scheduled
// ---------------------------------------------------------------------------

test("processed + private + future publishAt is SCHEDULED", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "succeeded",
      privacyStatus: "private",
      publishAt: FUTURE,
    }),
    NOW
  );

  assert.equal(result.status, "SCHEDULED");
  assert.equal(result.reason, "scheduled");
  assert.equal(result.publishAt?.toISOString(), FUTURE);
});

test("a past publishAt while still private is UPLOADED, not SCHEDULED", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "succeeded",
      privacyStatus: "private",
      publishAt: PAST,
    }),
    NOW
  );

  assert.equal(result.status, "UPLOADED");
  assert.equal(result.reason, "schedule_elapsed_still_private");
  assert.match(result.errorMessage ?? "", /still lists the video as private/i);
});

test("an unparseable publishAt does not create a false schedule", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      privacyStatus: "private",
      publishAt: "not-a-date",
    }),
    NOW
  );

  assert.equal(result.status, "UPLOADED");
  assert.equal(result.reason, "processed_private");
  assert.equal(result.publishAt, null);
});

// ---------------------------------------------------------------------------
// Published
// ---------------------------------------------------------------------------

test("processed + public is PUBLISHED", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "succeeded",
      privacyStatus: "public",
    }),
    NOW
  );

  assert.equal(result.status, "PUBLISHED");
  assert.equal(result.reason, "public");
});

test("public outranks a leftover future publishAt", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      privacyStatus: "public",
      publishAt: FUTURE,
    }),
    NOW
  );

  assert.equal(result.status, "PUBLISHED");
});

// ---------------------------------------------------------------------------
// Unlisted — the other "not public, not scheduled" shape
// ---------------------------------------------------------------------------

test("processed + unlisted with no publishAt is UPLOADED", () => {
  const result = mapYouTubeStatus(
    facts({
      uploadStatus: "processed",
      processingStatus: "succeeded",
      privacyStatus: "unlisted",
    }),
    NOW
  );

  assert.equal(result.status, "UPLOADED");
  assert.equal(result.reason, "processed_private");
});

// ---------------------------------------------------------------------------
// parsePublishAt
// ---------------------------------------------------------------------------

test("parsePublishAt returns null for null, empty and malformed input", () => {
  assert.equal(parsePublishAt(null), null);
  assert.equal(parsePublishAt(""), null);
  assert.equal(parsePublishAt("garbage"), null);
});

test("parsePublishAt round-trips a valid ISO instant", () => {
  assert.equal(parsePublishAt(FUTURE)?.toISOString(), FUTURE);
});

// ---------------------------------------------------------------------------
// The mapping never returns a status outside the enum, for any input shape
// ---------------------------------------------------------------------------

test("every combination maps to a known status and a known reason", () => {
  const allowed = new Set([
    "PROCESSING",
    "UPLOADED",
    "SCHEDULED",
    "PUBLISHED",
    "FAILED",
  ]);

  const uploadStatuses = [
    null,
    "deleted",
    "failed",
    "processed",
    "rejected",
    "uploaded",
    "somethingUnknown",
  ];
  const processingStatuses = [
    null,
    "processing",
    "succeeded",
    "failed",
    "terminated",
  ];
  const privacyStatuses = [null, "public", "private", "unlisted"];
  const publishAts = [null, FUTURE, PAST, "garbage"];

  let combinations = 0;

  for (const uploadStatus of uploadStatuses) {
    for (const processingStatus of processingStatuses) {
      for (const privacyStatus of privacyStatuses) {
        for (const publishAt of publishAts) {
          const result = mapYouTubeStatus(
            facts({
              uploadStatus,
              processingStatus,
              privacyStatus,
              publishAt,
            }),
            NOW
          );

          assert.ok(
            allowed.has(result.status),
            `unexpected status ${result.status}`
          );
          assert.equal(typeof result.reason, "string");
          combinations += 1;
        }
      }
    }
  }

  assert.equal(combinations, 7 * 5 * 4 * 4);
});

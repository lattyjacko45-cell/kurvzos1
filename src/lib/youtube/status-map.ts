/**
 * YouTube → KurvzOS status mapping.
 *
 * Deliberately dependency-free: no Prisma import, no `@/` alias, no network.
 * That keeps it directly executable by `node --experimental-strip-types` so the
 * branch tests in `status-map.test.ts` can run without adding a test framework.
 *
 * The status union below is asserted against Prisma's `ContentStatus` at the
 * call site in the refresh-status route, so drift is a compile error rather
 * than a runtime surprise.
 */

/** The subset of ContentStatus this mapping can produce. */
export type MappedContentStatus =
  | "PROCESSING"
  | "UPLOADED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "FAILED";

/**
 * Why the mapping landed where it did.
 *
 * A closed set of fixed identifiers, so it is always safe to log: it can never
 * carry a title, a channel id, a URL or a token.
 */
export type MappingReason =
  | "rejected"
  | "upload_failed"
  | "deleted"
  | "processing_failed"
  | "processing_terminated"
  | "awaiting_processing"
  | "processing_in_progress"
  | "public"
  | "scheduled"
  | "schedule_elapsed_still_private"
  | "processed_private";

/** Exactly the fields `videos.list` gives us, nothing derived. */
export interface YouTubeVideoFacts {
  /** status.uploadStatus — deleted | failed | processed | rejected | uploaded */
  uploadStatus: string | null;
  /** processingDetails.processingStatus — processing | succeeded | failed | terminated */
  processingStatus: string | null;
  /** status.privacyStatus — public | private | unlisted */
  privacyStatus: string | null;
  /** status.publishAt — ISO 8601 instant, only present while scheduled. */
  publishAt: string | null;
  /** status.failureReason — why the *upload* failed. */
  failureReason: string | null;
  /** status.rejectionReason — why YouTube *rejected* the video. */
  rejectionReason: string | null;
  /** processingDetails.processingFailureReason — why *processing* failed. */
  processingFailureReason: string | null;
}

export interface MappedStatus {
  status: MappedContentStatus;
  reason: MappingReason;
  /** User-facing truth. Null when there is nothing wrong to report. */
  errorMessage: string | null;
  /** Parsed publishAt, or null when absent or unparseable. */
  publishAt: Date | null;
}

/** status.rejectionReason → plain English. */
const REJECTION_MESSAGES: Record<string, string> = {
  claim: "YouTube rejected the video because of a content claim.",
  copyright: "YouTube rejected the video for a copyright claim.",
  duplicate: "YouTube rejected the video as a duplicate of one already uploaded.",
  inappropriate:
    "YouTube rejected the video as inappropriate under its content policies.",
  legal: "YouTube rejected the video for a legal claim.",
  length: "YouTube rejected the video because it exceeds the allowed length.",
  termsOfUse: "YouTube rejected the video for a terms of use violation.",
  trademark: "YouTube rejected the video for a trademark claim.",
  uploaderAccountClosed:
    "YouTube rejected the video because the uploading account is closed.",
  uploaderAccountSuspended:
    "YouTube rejected the video because the uploading account is suspended.",
};

/** status.failureReason → plain English. */
const FAILURE_MESSAGES: Record<string, string> = {
  codec: "The upload failed: YouTube does not support this video's codec.",
  conversion: "The upload failed: YouTube could not convert the video file.",
  emptyFile: "The upload failed: the video file was empty.",
  invalidFile: "The upload failed: YouTube could not read the video file.",
  tooSmall: "The upload failed: the video file was too small.",
  uploadAborted: "The upload was aborted before it finished.",
};

/** processingDetails.processingFailureReason → plain English. */
const PROCESSING_FAILURE_MESSAGES: Record<string, string> = {
  other: "YouTube could not process the video.",
  streamingFailed: "YouTube could not prepare the video for streaming.",
  transcodeFailed: "YouTube could not transcode the video.",
  uploadFailed: "YouTube reported the upload did not complete.",
};

function describe(
  table: Record<string, string>,
  key: string | null,
  fallback: string
): string {
  if (key && table[key]) return table[key];
  return fallback;
}

/**
 * Parses publishAt. Returns null for absent, malformed, or non-finite values so
 * a garbage timestamp can never be mistaken for a real schedule.
 */
export function parsePublishAt(raw: string | null): Date | null {
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Maps live YouTube facts onto one KurvzOS status.
 *
 * Order is load-bearing and is the actual fix for videos stuck on PROCESSING:
 *
 *   1. Terminal failures first — nothing later can redeem them.
 *   2. In-flight, keyed on `uploadStatus`, NOT `processingDetails`.
 *   3. Public.
 *   4. Scheduled.
 *   5. Processed and private — the truthful "done, not published" state.
 *
 * Step 2 is the correction. `status.uploadStatus === "processed"` is YouTube's
 * authoritative statement that processing finished; `processingDetails
 * .processingStatus` is a secondary signal that can lag behind it or come back
 * null. The previous mapping tested `processingStatus === "processing"` before
 * looking at `uploadStatus`, so a finished video whose processingDetails still
 * read "processing" was re-stamped PROCESSING on every refresh and could never
 * leave that state. Here, once uploadStatus is "processed", processingDetails
 * can no longer hold the item in PROCESSING.
 */
export function mapYouTubeStatus(
  facts: YouTubeVideoFacts,
  now: Date = new Date()
): MappedStatus {
  const publishAt = parsePublishAt(facts.publishAt);

  // ---- 1. Terminal failures -------------------------------------------------

  if (facts.uploadStatus === "rejected") {
    return {
      status: "FAILED",
      reason: "rejected",
      errorMessage: describe(
        REJECTION_MESSAGES,
        facts.rejectionReason,
        "YouTube rejected the video."
      ),
      publishAt,
    };
  }

  if (facts.uploadStatus === "failed") {
    return {
      status: "FAILED",
      reason: "upload_failed",
      errorMessage: describe(
        FAILURE_MESSAGES,
        facts.failureReason,
        "The upload failed on YouTube."
      ),
      publishAt,
    };
  }

  if (facts.uploadStatus === "deleted") {
    return {
      status: "FAILED",
      reason: "deleted",
      errorMessage:
        "The video no longer exists on YouTube. It was deleted outside KurvzOS.",
      publishAt,
    };
  }

  if (facts.processingStatus === "failed") {
    return {
      status: "FAILED",
      reason: "processing_failed",
      errorMessage: describe(
        PROCESSING_FAILURE_MESSAGES,
        facts.processingFailureReason,
        "YouTube could not process the video."
      ),
      publishAt,
    };
  }

  if (facts.processingStatus === "terminated") {
    return {
      status: "FAILED",
      reason: "processing_terminated",
      errorMessage:
        "YouTube stopped processing the video before it finished. Re-upload it.",
      publishAt,
    };
  }

  // ---- 2. Still in flight ---------------------------------------------------

  // "uploaded" means received but not yet processed. This is the only
  // uploadStatus that legitimately holds an item in PROCESSING.
  if (facts.uploadStatus === "uploaded") {
    return {
      status: "PROCESSING",
      reason: "awaiting_processing",
      errorMessage: null,
      publishAt,
    };
  }

  // Only when uploadStatus tells us nothing do we fall back to processingDetails.
  if (facts.uploadStatus === null && facts.processingStatus === "processing") {
    return {
      status: "PROCESSING",
      reason: "processing_in_progress",
      errorMessage: null,
      publishAt,
    };
  }

  // ---- 3. Public ------------------------------------------------------------

  // Checked before publishAt: if the video is public it is already visible, and
  // a leftover publish time must not downgrade that to "Scheduled".
  if (facts.privacyStatus === "public") {
    return {
      status: "PUBLISHED",
      reason: "public",
      errorMessage: null,
      publishAt,
    };
  }

  // ---- 4. Scheduled ---------------------------------------------------------

  if (publishAt && publishAt.getTime() > now.getTime()) {
    return {
      status: "SCHEDULED",
      reason: "scheduled",
      errorMessage: null,
      publishAt,
    };
  }

  // ---- 5. Processed and private --------------------------------------------

  // A publish time that has already passed while the video is still private is
  // not "Scheduled" and not "Published". Report it as uploaded, and say why.
  if (publishAt) {
    return {
      status: "UPLOADED",
      reason: "schedule_elapsed_still_private",
      errorMessage:
        "The scheduled time has passed but YouTube still lists the video as private. Unverified API projects can have publishing held back until Google completes its audit. Check the video in YouTube Studio.",
      publishAt,
    };
  }

  return {
    status: "UPLOADED",
    reason: "processed_private",
    errorMessage: null,
    publishAt,
  };
}

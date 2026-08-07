/**
 * Shared Content Studio rules. Pure and prisma-free so the form and the API
 * validate against exactly the same limits.
 */

export const CONTENT_TYPE_LABELS = {
  LONG_FORM: "Long-Form Video",
  SHORT: "Short",
} as const;

export type ContentTypeValue = keyof typeof CONTENT_TYPE_LABELS;

export const CONTENT_STATUS_LABELS = {
  DRAFT: "Draft",
  READY: "Ready",
  UPLOADING: "Uploading",
  PROCESSING: "Processing",
  UPLOADED: "Uploaded",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  FAILED: "Failed",
} as const;

export type ContentStatusValue = keyof typeof CONTENT_STATUS_LABELS;

/** A small, stable subset of YouTube's category ids. */
export const YOUTUBE_CATEGORIES = [
  { id: "22", label: "People & Blogs" },
  { id: "27", label: "Education" },
  { id: "26", label: "Howto & Style" },
  { id: "24", label: "Entertainment" },
  { id: "28", label: "Science & Technology" },
  { id: "20", label: "Gaming" },
  { id: "10", label: "Music" },
] as const;

// YouTube's own limits.
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_TAGS_TOTAL_LENGTH = 500;
export const MAX_TAG_COUNT = 30;

export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
export const ALLOWED_THUMBNAIL_TYPES = ["image/jpeg", "image/png"] as const;

/** 128 GB, YouTube's per-file ceiling. */
export const MAX_VIDEO_BYTES = 128 * 1024 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/x-msvideo",
] as const;

/** Scheduling must be far enough out that YouTube accepts it. */
export const MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;

export type FieldErrors = Record<string, string>;

export interface PublishingDetailsInput {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  madeForKids: boolean;
  contentType: string;
  scheduledAt: string | null;
  timezone: string;
}

/** Splits the comma-separated tag field into a clean array. */
export function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, MAX_TAG_COUNT);
}

export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}

export function isAllowedVideoType(type: string): boolean {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(type);
}

export function isAllowedThumbnailType(type: string): boolean {
  return (ALLOWED_THUMBNAIL_TYPES as readonly string[]).includes(type);
}

/**
 * Validates publishing details. Returns a map of field name → message so the
 * form can attach each error to its own input.
 */
export function validatePublishingDetails(
  input: PublishingDetailsInput,
  now: Date = new Date()
): FieldErrors {
  const errors: FieldErrors = {};

  const title = input.title.trim();
  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }

  if (input.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  const tagsLength = input.tags.join(",").length;
  if (tagsLength > MAX_TAGS_TOTAL_LENGTH) {
    errors.tags = `Tags must total ${MAX_TAGS_TOTAL_LENGTH} characters or fewer.`;
  }

  if (!YOUTUBE_CATEGORIES.some((category) => category.id === input.categoryId)) {
    errors.categoryId = "Choose a category.";
  }

  if (!(input.contentType in CONTENT_TYPE_LABELS)) {
    errors.contentType = "Choose a content type.";
  }

  if (input.scheduledAt) {
    const instant = new Date(input.scheduledAt);

    if (Number.isNaN(instant.getTime())) {
      errors.scheduledAt = "Scheduled time is not a valid date.";
    } else if (instant.getTime() <= now.getTime()) {
      errors.scheduledAt = "Scheduled time must be in the future.";
    } else if (instant.getTime() - now.getTime() < MIN_SCHEDULE_LEAD_MS) {
      errors.scheduledAt = "Schedule at least 15 minutes ahead.";
    }
  }

  if (!input.timezone.trim()) {
    errors.timezone = "Timezone is required.";
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Human-readable, screen-reader friendly progress text. */
export function uploadProgressLabel(
  status: ContentStatusValue,
  percent: number
): string {
  switch (status) {
    case "UPLOADING":
      return `Uploading video, ${percent} percent complete.`;
    case "PROCESSING":
      return "Upload complete. YouTube is processing the video.";
    case "UPLOADED":
      return "Upload complete. The video is private on YouTube.";
    case "SCHEDULED":
      return "Video is scheduled on YouTube.";
    case "PUBLISHED":
      return "Video is published on YouTube.";
    case "FAILED":
      return "Upload failed. You can retry.";
    case "READY":
      return "Publishing details saved. Ready to upload.";
    default:
      return "Draft. Add publishing details to continue.";
  }
}

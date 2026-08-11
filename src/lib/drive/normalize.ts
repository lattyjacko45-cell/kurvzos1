/**
 * Google Drive file normalization and query building.
 *
 * Deliberately dependency-free — no Prisma, no Next, no `@/` alias, no network
 * — so the branch tests in `normalize.test.mjs` run directly under Node's type
 * stripping, and so client components can import the types safely. Same
 * arrangement as the Gmail and YouTube pure modules. Keep it that way.
 *
 * This module is also the privacy boundary. `normalizeDriveFile` copies a fixed
 * allowlist, so owners, permissions, sharing state, parent folder ids and
 * thumbnail links never leave the Drive layer even if a future caller widens
 * the `fields` mask.
 */

/**
 * The only file shape allowed out of the Drive integration.
 *
 * Shaped for reuse: Projects, Content Studio and Harper all need "which asset,
 * what kind, how fresh, where is it" and nothing more. Every field is a plain
 * scalar — no nested Google types, no Date objects to serialize.
 */
export interface DriveFile {
  id: string;
  name: string;
  /** Raw Google MIME type, kept so callers can do their own matching. */
  mimeType: string;
  /** Coarse bucket for grouping and filtering. */
  category: DriveFileCategory;
  /** Human label for the type, e.g. "Google Doc". */
  typeLabel: string;
  /** ISO 8601 instant of the last modification. */
  modifiedAt: string;
  /** Opens the file in the relevant Google editor or viewer. */
  webViewLink: string | null;
  /** Null for Google-native files, which report no byte size. */
  sizeBytes: number | null;
  isFolder: boolean;
}

export type DriveFileCategory =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "form"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "folder"
  | "other";

/** The raw fields we request. Everything else in the payload is ignored. */
export interface RawDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  /** Google returns this as a string, and omits it for native Google files. */
  size?: string;
  trashed?: boolean;
}

export const UNTITLED_FILE = "Untitled";

export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/** Exact Google-native MIME types, checked before the prefix rules below. */
const EXACT_MIME_TYPES: Record<
  string,
  { category: DriveFileCategory; label: string }
> = {
  [FOLDER_MIME_TYPE]: { category: "folder", label: "Folder" },
  "application/vnd.google-apps.document": {
    category: "document",
    label: "Google Doc",
  },
  "application/vnd.google-apps.spreadsheet": {
    category: "spreadsheet",
    label: "Google Sheet",
  },
  "application/vnd.google-apps.presentation": {
    category: "presentation",
    label: "Google Slides",
  },
  "application/vnd.google-apps.form": { category: "form", label: "Google Form" },
  "application/vnd.google-apps.drawing": {
    category: "image",
    label: "Google Drawing",
  },
  "application/pdf": { category: "pdf", label: "PDF" },
  "text/plain": { category: "document", label: "Text file" },
  "text/csv": { category: "spreadsheet", label: "CSV" },
  "application/zip": { category: "archive", label: "Archive" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    category: "document",
    label: "Word document",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    category: "spreadsheet",
    label: "Excel spreadsheet",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    category: "presentation",
    label: "PowerPoint",
  },
};

/** Prefix fallbacks, applied only when no exact match exists. */
const MIME_PREFIXES: Array<{
  prefix: string;
  category: DriveFileCategory;
  label: string;
}> = [
  { prefix: "image/", category: "image", label: "Image" },
  { prefix: "video/", category: "video", label: "Video" },
  { prefix: "audio/", category: "audio", label: "Audio" },
];

/**
 * Classifies a MIME type into a coarse bucket plus a human label.
 *
 * Exact matches win over prefixes so that `application/vnd.google-apps.drawing`
 * is a Drawing rather than falling through to a generic bucket.
 */
export function classifyMimeType(mimeType: string | undefined): {
  category: DriveFileCategory;
  typeLabel: string;
} {
  const raw = (mimeType ?? "").trim();
  if (!raw) return { category: "other", typeLabel: "File" };

  // hasOwnProperty, not a bare lookup: a MIME type of "constructor" would
  // otherwise resolve up the prototype chain to a function.
  if (Object.prototype.hasOwnProperty.call(EXACT_MIME_TYPES, raw)) {
    const match = EXACT_MIME_TYPES[raw];
    return { category: match.category, typeLabel: match.label };
  }

  for (const entry of MIME_PREFIXES) {
    if (raw.startsWith(entry.prefix)) {
      return { category: entry.category, typeLabel: entry.label };
    }
  }

  return { category: "other", typeLabel: "File" };
}

/** Google reports size as a decimal string, and omits it for native files. */
export function parseSizeBytes(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.trunc(parsed);
}

/** Compact, human-readable size. Returns null when Drive reported none. */
export function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Escapes a value for a Drive `q` search term.
 *
 * Google's guidance: a filename containing an apostrophe or a backslash must
 * have them backslash-escaped, otherwise the query is malformed. Backslash is
 * replaced first — doing it second would double-escape the backslashes this
 * function had just introduced for apostrophes.
 *
 * This is also the injection guard: a user typing `' or trashed = true or '`
 * into the search box ends up as a literal string rather than extra query
 * clauses.
 */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Longer terms are pointless and risk a 400 from Google. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * Builds the `q` parameter for a recent-files listing.
 *
 * Always excludes trashed files; a deleted asset is not a business asset. When
 * a search term is present it is matched against the file name only — Drive's
 * `fullText` operator searches file *contents*, which this scope cannot read
 * and which the user has not asked us to search.
 */
export function buildSearchQuery(search: string | null | undefined): string {
  const clauses = ["trashed = false"];
  const term = (search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);

  if (term) {
    clauses.push(`name contains '${escapeQueryValue(term)}'`);
  }

  return clauses.join(" and ");
}

/**
 * Maps one raw Drive file onto the normalized shape.
 *
 * Returns null when the file cannot be represented honestly — no id, or no
 * usable modified time. A missing name degrades to a placeholder rather than
 * dropping the row, because an unnamed file still exists and is still openable.
 */
export function normalizeDriveFile(raw: RawDriveFile): DriveFile | null {
  if (!raw.id) return null;

  const modified = raw.modifiedTime ? new Date(raw.modifiedTime) : null;
  if (!modified || Number.isNaN(modified.getTime())) return null;

  const { category, typeLabel } = classifyMimeType(raw.mimeType);

  return {
    id: raw.id,
    name: raw.name?.trim() || UNTITLED_FILE,
    mimeType: raw.mimeType ?? "",
    category,
    typeLabel,
    modifiedAt: modified.toISOString(),
    webViewLink: raw.webViewLink?.trim() || null,
    sizeBytes: parseSizeBytes(raw.size),
    isFolder: raw.mimeType === FOLDER_MIME_TYPE,
  };
}

/**
 * Normalizes a batch, drops anything unrepresentable and trashed leftovers,
 * then orders most recently modified first.
 *
 * The `q` filter already excludes trashed files, but a `trashed: true` entry is
 * dropped here too — belt and braces, because the filter is a string the caller
 * could change.
 */
export function normalizeDriveFiles(raw: RawDriveFile[]): DriveFile[] {
  return raw
    .filter((file) => file.trashed !== true)
    .map(normalizeDriveFile)
    .filter((file): file is DriveFile => file !== null)
    .sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );
}

/**
 * Human-readable modified time.
 *
 * Lives here so the server's first paint and the browser's local-timezone
 * correction format identically — only the zone differs.
 */
export function formatModifiedAt(iso: string, timeZone?: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Outcome of a Drive read.
 *
 * Declared here rather than in `read.server.ts` so the connection card — a
 * client component — can type its prop without importing a module that pulls in
 * Prisma.
 */
export type DriveReadState =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error";

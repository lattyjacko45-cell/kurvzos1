/**
 * Branch tests for Google Drive normalization and query building.
 *
 * Run with:  npm test
 *
 * A .mjs file for the same reason as the other pure-module tests: Node's type
 * stripping needs the explicit "./normalize.ts" specifier, and permitting that
 * in TypeScript would require allowImportingTsExtensions, which changes how the
 * Prisma generator emits its own imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchQuery,
  classifyMimeType,
  escapeQueryValue,
  formatFileSize,
  formatModifiedAt,
  normalizeDriveFile,
  normalizeDriveFiles,
  parseSizeBytes,
  FOLDER_MIME_TYPE,
  UNTITLED_FILE,
} from "./normalize.ts";

const MODIFIED_ISO = "2026-08-11T09:42:00.000Z";

function file(over = {}) {
  return {
    id: "f1",
    name: "Q3 content plan",
    mimeType: "application/vnd.google-apps.document",
    modifiedTime: MODIFIED_ISO,
    webViewLink: "https://docs.google.com/document/d/f1/edit",
    trashed: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// escapeQueryValue — the injection guard
// ---------------------------------------------------------------------------

test("escapes apostrophes so a filename cannot break the query", () => {
  assert.equal(escapeQueryValue("quinn's paper"), "quinn\\'s paper");
});

test("escapes backslashes before apostrophes, not after", () => {
  // Escaping in the wrong order would double-escape the backslash this
  // function itself introduced for the apostrophe.
  assert.equal(escapeQueryValue("a\\b"), "a\\\\b");
  assert.equal(escapeQueryValue("a\\'b"), "a\\\\\\'b");
});

test("a search term cannot inject extra query clauses", () => {
  const hostile = "' or trashed = true or name contains '";
  const query = buildSearchQuery(hostile);

  // Every apostrophe from the user is escaped, so the whole thing stays one
  // string literal rather than becoming additional clauses.
  assert.ok(query.startsWith("trashed = false and name contains '"));
  assert.ok(!query.includes("or trashed = true or name contains ''"));
  assert.equal(query.match(/trashed = false/g)?.length, 1);
});

// ---------------------------------------------------------------------------
// buildSearchQuery
// ---------------------------------------------------------------------------

test("always excludes trashed files", () => {
  assert.equal(buildSearchQuery(null), "trashed = false");
  assert.equal(buildSearchQuery(""), "trashed = false");
  assert.equal(buildSearchQuery("   "), "trashed = false");
  assert.equal(buildSearchQuery(undefined), "trashed = false");
});

test("adds a name filter when a term is given", () => {
  assert.equal(
    buildSearchQuery("brand kit"),
    "trashed = false and name contains 'brand kit'"
  );
});

test("searches names, never file contents", () => {
  // fullText would search inside documents, which the metadata scope cannot
  // read and which was never requested.
  assert.ok(!buildSearchQuery("anything").includes("fullText"));
});

test("caps an overlong search term", () => {
  const query = buildSearchQuery("x".repeat(500));
  const term = query.split("'")[1];

  assert.equal(term.length, 100);
});

// ---------------------------------------------------------------------------
// classifyMimeType
// ---------------------------------------------------------------------------

test("classifies Google-native types with their own labels", () => {
  assert.deepEqual(classifyMimeType("application/vnd.google-apps.document"), {
    category: "document",
    typeLabel: "Google Doc",
  });
  assert.deepEqual(classifyMimeType("application/vnd.google-apps.spreadsheet"), {
    category: "spreadsheet",
    typeLabel: "Google Sheet",
  });
  assert.deepEqual(classifyMimeType(FOLDER_MIME_TYPE), {
    category: "folder",
    typeLabel: "Folder",
  });
});

test("falls back to prefix rules for media", () => {
  assert.equal(classifyMimeType("image/png").category, "image");
  assert.equal(classifyMimeType("video/mp4").category, "video");
  assert.equal(classifyMimeType("audio/mpeg").category, "audio");
});

test("an exact match outranks a prefix rule", () => {
  // Drawings are image-ish but have their own label.
  assert.equal(
    classifyMimeType("application/vnd.google-apps.drawing").typeLabel,
    "Google Drawing"
  );
});

test("unknown and missing types degrade to a generic file", () => {
  assert.deepEqual(classifyMimeType("application/x-unknown"), {
    category: "other",
    typeLabel: "File",
  });
  assert.deepEqual(classifyMimeType(undefined), {
    category: "other",
    typeLabel: "File",
  });
  assert.deepEqual(classifyMimeType("   "), {
    category: "other",
    typeLabel: "File",
  });
});

test("does not resolve prototype members as MIME types", () => {
  // A bare map lookup would return Object.prototype.constructor here.
  assert.equal(classifyMimeType("constructor").category, "other");
  assert.equal(classifyMimeType("__proto__").category, "other");
});

// ---------------------------------------------------------------------------
// parseSizeBytes / formatFileSize
// ---------------------------------------------------------------------------

test("parses Drive's decimal string size", () => {
  assert.equal(parseSizeBytes("1024"), 1024);
  assert.equal(parseSizeBytes("0"), 0);
});

test("treats a missing or unusable size as unknown", () => {
  // Google omits size entirely for native Docs, Sheets and Slides.
  assert.equal(parseSizeBytes(undefined), null);
  assert.equal(parseSizeBytes(""), null);
  assert.equal(parseSizeBytes("not-a-number"), null);
  assert.equal(parseSizeBytes("-5"), null);
});

test("formats sizes compactly and returns null when unknown", () => {
  assert.equal(formatFileSize(null), null);
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(1536), "1.5 KB");
  assert.equal(formatFileSize(1024 * 1024 * 5), "5.0 MB");
  assert.equal(formatFileSize(1024 * 1024 * 1024 * 3), "3.0 GB");
});

// ---------------------------------------------------------------------------
// normalizeDriveFile
// ---------------------------------------------------------------------------

test("normalizes a complete file", () => {
  const result = normalizeDriveFile(file());

  assert.deepEqual(result, {
    id: "f1",
    name: "Q3 content plan",
    mimeType: "application/vnd.google-apps.document",
    category: "document",
    typeLabel: "Google Doc",
    modifiedAt: MODIFIED_ISO,
    webViewLink: "https://docs.google.com/document/d/f1/edit",
    sizeBytes: null,
    isFolder: false,
  });
});

test("marks folders", () => {
  const result = normalizeDriveFile(file({ mimeType: FOLDER_MIME_TYPE }));

  assert.equal(result?.isFolder, true);
  assert.equal(result?.category, "folder");
});

test("an unnamed file degrades to a placeholder rather than dropping", () => {
  assert.equal(normalizeDriveFile(file({ name: "   " }))?.name, UNTITLED_FILE);
  assert.equal(normalizeDriveFile(file({ name: undefined }))?.name, UNTITLED_FILE);
});

test("a file with no id or no usable modified time is dropped", () => {
  assert.equal(normalizeDriveFile(file({ id: undefined })), null);
  assert.equal(normalizeDriveFile(file({ modifiedTime: undefined })), null);
  assert.equal(normalizeDriveFile(file({ modifiedTime: "garbage" })), null);
});

test("a missing webViewLink becomes null, not an empty link", () => {
  assert.equal(normalizeDriveFile(file({ webViewLink: undefined }))?.webViewLink, null);
  assert.equal(normalizeDriveFile(file({ webViewLink: "  " }))?.webViewLink, null);
});

test("normalization never copies fields outside the allowlist", () => {
  // Owners, permissions and thumbnails must not survive even if a future
  // caller widens the fields mask.
  const result = normalizeDriveFile(
    file({
      owners: [{ emailAddress: "latoya@example.com" }],
      permissions: [{ emailAddress: "someone@example.com" }],
      thumbnailLink: "https://lh3.googleusercontent.com/secret",
      parents: ["parent-folder-id"],
      description: "internal only",
    })
  );

  const serialized = JSON.stringify(result);

  assert.ok(!serialized.includes("latoya@example.com"), "owner leaked");
  assert.ok(!serialized.includes("someone@example.com"), "permission leaked");
  assert.ok(!serialized.includes("googleusercontent"), "thumbnail leaked");
  assert.ok(!serialized.includes("parent-folder-id"), "parent leaked");
  assert.ok(!serialized.includes("internal only"), "description leaked");

  assert.deepEqual(Object.keys(result ?? {}).sort(), [
    "category",
    "id",
    "isFolder",
    "mimeType",
    "modifiedAt",
    "name",
    "sizeBytes",
    "typeLabel",
    "webViewLink",
  ]);
});

// ---------------------------------------------------------------------------
// normalizeDriveFiles
// ---------------------------------------------------------------------------

test("a batch is ordered newest first and unusable entries are dropped", () => {
  const result = normalizeDriveFiles([
    file({ id: "old", modifiedTime: "2026-08-01T00:00:00.000Z" }),
    file({ id: "broken", modifiedTime: undefined }),
    file({ id: "new", modifiedTime: "2026-08-20T00:00:00.000Z" }),
    file({ id: "mid" }),
  ]);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["new", "mid", "old"]
  );
});

test("trashed files are dropped even if the query filter is bypassed", () => {
  const result = normalizeDriveFiles([
    file({ id: "kept" }),
    file({ id: "binned", trashed: true }),
  ]);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["kept"]
  );
});

test("an empty batch normalizes to an empty list", () => {
  assert.deepEqual(normalizeDriveFiles([]), []);
});

// ---------------------------------------------------------------------------
// formatModifiedAt
// ---------------------------------------------------------------------------

test("formats a stable label for a given zone", () => {
  assert.equal(formatModifiedAt(MODIFIED_ISO, "UTC"), "Aug 11, 2026");
});

test("returns an empty string for an unparseable value", () => {
  assert.equal(formatModifiedAt("garbage"), "");
});

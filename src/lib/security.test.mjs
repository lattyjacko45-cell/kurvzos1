/**
 * Branch tests for same-origin redirect validation.
 *
 * The `redirect` parameter is attacker-reachable — middleware puts it in the
 * URL, and emailed auth links carry `next` — so this is the function standing
 * between KurvzOS and an open redirect out of its own login page.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { safeInternalRedirect } from "./security.ts";

const ORIGIN = "https://app.example.com";

test("a plain in-app path is preserved", () => {
  assert.equal(safeInternalRedirect("/inbox", ORIGIN), "/inbox");
  assert.equal(safeInternalRedirect("/dashboard/tasks", ORIGIN), "/dashboard/tasks");
});

test("query and hash survive the round trip", () => {
  assert.equal(
    safeInternalRedirect("/dashboard/tasks?tab=completed#top", ORIGIN),
    "/dashboard/tasks?tab=completed#top"
  );
});

test("a same-origin absolute URL is reduced to its path", () => {
  assert.equal(
    safeInternalRedirect(`${ORIGIN}/executive-team`, ORIGIN),
    "/executive-team"
  );
});

test("OPEN REDIRECT: a foreign origin falls back to the default", () => {
  assert.equal(
    safeInternalRedirect("https://evil.example.com/steal", ORIGIN),
    "/dashboard"
  );
});

test("OPEN REDIRECT: a protocol-relative URL falls back", () => {
  // "//evil.example.com" resolves to a different origin, despite starting
  // with a slash — which is why a startsWith("/") check is not enough.
  assert.equal(safeInternalRedirect("//evil.example.com", ORIGIN), "/dashboard");
});

test("OPEN REDIRECT: backslash-prefixed URLs fall back", () => {
  // Browsers normalise backslashes to slashes, so "\\/evil.example.com"
  // becomes protocol-relative. Parsing rather than prefix-matching is what
  // catches this.
  assert.equal(safeInternalRedirect("\\\\evil.example.com", ORIGIN), "/dashboard");
  assert.equal(safeInternalRedirect("\\/evil.example.com", ORIGIN), "/dashboard");
});

test("OPEN REDIRECT: non-http schemes fall back", () => {
  assert.equal(safeInternalRedirect("javascript:alert(1)", ORIGIN), "/dashboard");
  assert.equal(safeInternalRedirect("data:text/html,<h1>x", ORIGIN), "/dashboard");
  assert.equal(safeInternalRedirect("mailto:someone@example.com", ORIGIN), "/dashboard");
});

test("OPEN REDIRECT: a lookalike host falls back", () => {
  assert.equal(
    safeInternalRedirect("https://app.example.com.evil.test/x", ORIGIN),
    "/dashboard"
  );
});

test("a different port is a different origin", () => {
  assert.equal(
    safeInternalRedirect("https://app.example.com:8443/x", ORIGIN),
    "/dashboard"
  );
});

test("missing and malformed candidates fall back", () => {
  assert.equal(safeInternalRedirect(null, ORIGIN), "/dashboard");
  assert.equal(safeInternalRedirect("", ORIGIN), "/dashboard");
});

test("the caller can choose a different fallback", () => {
  assert.equal(
    safeInternalRedirect("https://evil.example.com", ORIGIN, "/login"),
    "/login"
  );
});

/**
 * Branch tests for the middleware auth-check decision logic.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_CHECK_TIMEOUT_MS,
  classifyRoute,
  decideMiddlewareAction,
  getUserWithTimeout,
  hasSupabaseAuthCookie,
} from "./auth-check.ts";

// ---------------------------------------------------------------------------
// hasSupabaseAuthCookie
// ---------------------------------------------------------------------------

test("hasSupabaseAuthCookie: true when a Supabase session cookie is present", () => {
  assert.equal(hasSupabaseAuthCookie(["sb-abcxyz-auth-token"]), true);
});

test("hasSupabaseAuthCookie: true for a chunked Supabase session cookie", () => {
  assert.equal(
    hasSupabaseAuthCookie(["sb-abcxyz-auth-token.0", "sb-abcxyz-auth-token.1"]),
    true
  );
});

test("hasSupabaseAuthCookie: false with no cookies", () => {
  assert.equal(hasSupabaseAuthCookie([]), false);
});

test("hasSupabaseAuthCookie: false with unrelated cookies only", () => {
  assert.equal(hasSupabaseAuthCookie(["theme", "sidebar_state"]), false);
});

// ---------------------------------------------------------------------------
// getUserWithTimeout
// ---------------------------------------------------------------------------

test("getUserWithTimeout: resolves ok with a user (normal authenticated success)", async () => {
  const outcome = await getUserWithTimeout(
    async () => ({ data: { user: { id: "user-1" } } }),
    AUTH_CHECK_TIMEOUT_MS
  );
  assert.deepEqual(outcome, { status: "ok", user: { id: "user-1" } });
});

test("getUserWithTimeout: resolves ok with no user (normal unauthenticated)", async () => {
  const outcome = await getUserWithTimeout(
    async () => ({ data: { user: null } }),
    AUTH_CHECK_TIMEOUT_MS
  );
  assert.deepEqual(outcome, { status: "ok", user: null });
});

test("getUserWithTimeout: resolves timeout when getUser never settles in time", async () => {
  const outcome = await getUserWithTimeout(
    () => new Promise(() => {}), // never resolves
    10
  );
  assert.deepEqual(outcome, { status: "timeout" });
});

test("getUserWithTimeout: resolves error when getUser throws", async () => {
  const outcome = await getUserWithTimeout(async () => {
    throw new Error("network down");
  }, AUTH_CHECK_TIMEOUT_MS);
  assert.deepEqual(outcome, { status: "error" });
});

// ---------------------------------------------------------------------------
// classifyRoute
// ---------------------------------------------------------------------------

test("classifyRoute: /dashboard is protected, not an auth route", () => {
  assert.deepEqual(classifyRoute("/dashboard"), {
    isAuthRoute: false,
    isProtectedRoute: true,
  });
});

test("classifyRoute: /login is an auth route, not protected", () => {
  assert.deepEqual(classifyRoute("/login"), {
    isAuthRoute: true,
    isProtectedRoute: false,
  });
});

test("classifyRoute: /reset-password is neither, so an expired link is never bounced", () => {
  assert.deepEqual(classifyRoute("/reset-password"), {
    isAuthRoute: false,
    isProtectedRoute: false,
  });
});

// ---------------------------------------------------------------------------
// decideMiddlewareAction — the 5 required scenarios, plus supporting cases
// ---------------------------------------------------------------------------

test("decideMiddlewareAction: normal authenticated success on a protected route continues", () => {
  const action = decideMiddlewareAction({
    hasCookie: true,
    outcome: { status: "ok", user: { id: "user-1" } },
    isAuthRoute: false,
    isProtectedRoute: true,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "continue" });
});

test("decideMiddlewareAction: normal unauthenticated protected-route redirect", () => {
  const action = decideMiddlewareAction({
    hasCookie: true,
    outcome: { status: "ok", user: null },
    isAuthRoute: false,
    isProtectedRoute: true,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "redirect-login" });
});

test("decideMiddlewareAction: no session cookie on a protected route redirects without waiting on a check", () => {
  const action = decideMiddlewareAction({
    hasCookie: false,
    outcome: null,
    isAuthRoute: false,
    isProtectedRoute: true,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "redirect-login" });
});

test("decideMiddlewareAction: no session cookie on a public route continues", () => {
  const action = decideMiddlewareAction({
    hasCookie: false,
    outcome: null,
    isAuthRoute: false,
    isProtectedRoute: false,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "continue" });
});

test("decideMiddlewareAction: auth check timeout with an existing cookie never redirects", () => {
  const action = decideMiddlewareAction({
    hasCookie: true,
    outcome: { status: "timeout" },
    isAuthRoute: false,
    isProtectedRoute: true,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "continue" });
});

test("decideMiddlewareAction: thrown auth error with an existing cookie never redirects", () => {
  const action = decideMiddlewareAction({
    hasCookie: true,
    outcome: { status: "error" },
    isAuthRoute: false,
    isProtectedRoute: true,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "continue" });
});

test("decideMiddlewareAction: authenticated user on an auth route redirects to dashboard", () => {
  const action = decideMiddlewareAction({
    hasCookie: true,
    outcome: { status: "ok", user: { id: "user-1" } },
    isAuthRoute: true,
    isProtectedRoute: false,
    isLinkFailure: false,
  });
  assert.deepEqual(action, { type: "redirect-dashboard" });
});

test("decideMiddlewareAction: authenticated user on an auth route with a link-failure notice stays put", () => {
  const action = decideMiddlewareAction({
    hasCookie: true,
    outcome: { status: "ok", user: { id: "user-1" } },
    isAuthRoute: true,
    isProtectedRoute: false,
    isLinkFailure: true,
  });
  assert.deepEqual(action, { type: "continue" });
});

/**
 * Branch tests for auth messaging, validation and signup outcome detection.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_NOTICES,
  PASSWORD_MIN_LENGTH,
  SIGNUP_MESSAGES,
  buildAuthRedirectUrl,
  describeAuthError,
  describeSignupOutcome,
  isAuthNotice,
  isDuplicateSignupError,
  isLinkFailureNotice,
  noticeForProviderError,
  parseAuthErrorFragment,
  passwordFieldState,
  validatePassword,
} from "./auth-messages.ts";

// ---------------------------------------------------------------------------
// Password visibility toggle
//
// Only the two invariants worth locking are asserted. Rendering assertions
// would need a DOM dependency the project does not have, and would break on
// any markup change without protecting anything real.
// ---------------------------------------------------------------------------

test("a password field is hidden unless explicitly revealed", () => {
  assert.equal(passwordFieldState(false).type, "password");
});

test("revealing a field switches only the input type", () => {
  assert.equal(passwordFieldState(true).type, "text");
});

test("the control is labelled with the action it performs", () => {
  // Not the current state: a screen reader user needs to know what pressing
  // it will do. aria-pressed carries the state separately.
  assert.equal(passwordFieldState(false).toggleLabel, "Show password");
  assert.equal(passwordFieldState(true).toggleLabel, "Hide password");
});

// ---------------------------------------------------------------------------
// Provider errors never reach the user verbatim
// ---------------------------------------------------------------------------

test("recognised errors become copy we control", () => {
  assert.match(
    describeAuthError({ code: "invalid_credentials" }),
    /email or password is not correct/i
  );
  assert.match(
    describeAuthError({ message: "Invalid login credentials" }),
    /email or password is not correct/i
  );
  assert.match(
    describeAuthError({ code: "email_not_confirmed" }),
    /confirm your email/i
  );
  assert.match(
    describeAuthError({ code: "over_email_send_rate_limit" }),
    /too many emails/i
  );
});

test("an unrecognised provider error never leaks its own text", () => {
  const leaky =
    "AuthApiError: relation \"auth.users\" does not exist at line 42";
  const result = describeAuthError({ message: leaky });

  assert.ok(!result.includes("AuthApiError"));
  assert.ok(!result.includes("auth.users"));
  assert.ok(!result.includes("line 42"));
  assert.match(result, /something went wrong/i);
});

test("malformed error inputs still produce usable copy", () => {
  for (const input of [null, undefined, "string", 42, {}, { code: 5 }]) {
    const result = describeAuthError(input);
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0);
  }
});

test("matching is case-insensitive across code and message", () => {
  assert.match(
    describeAuthError({ message: "EMAIL NOT CONFIRMED" }),
    /confirm your email/i
  );
});

// ---------------------------------------------------------------------------
// Notices — the closed set that may appear in a URL
// ---------------------------------------------------------------------------

test("only members of the closed notice set are accepted", () => {
  assert.equal(isAuthNotice("link_expired"), true);
  assert.equal(isAuthNotice("password_updated"), true);

  assert.equal(isAuthNotice("constructor"), false);
  assert.equal(isAuthNotice("__proto__"), false);
  assert.equal(isAuthNotice("anything-else"), false);
  assert.equal(isAuthNotice(undefined), false);
});

test("every notice is URL-safe and says something", () => {
  for (const [key, copy] of Object.entries(AUTH_NOTICES)) {
    assert.equal(encodeURIComponent(key), key, `${key} is not URL-safe`);
    assert.ok(copy.length > 0, `${key} has no copy`);
  }
});

// ---------------------------------------------------------------------------
// Password validation
// ---------------------------------------------------------------------------

test("passwords must meet the minimum length", () => {
  const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
  assert.match(validatePassword(short, short) ?? "", /at least/i);
});

test("mismatched confirmations are rejected", () => {
  assert.match(
    validatePassword("correct-horse", "correct-hors") ?? "",
    /do not match/i
  );
});

test("a valid matching password passes", () => {
  const password = "a".repeat(PASSWORD_MIN_LENGTH);
  assert.equal(validatePassword(password, password), null);
});

test("length is checked before equality", () => {
  // Two identical too-short passwords must report the length problem, not
  // silently pass because they matched.
  assert.match(validatePassword("abc", "abc") ?? "", /at least/i);
});

// ---------------------------------------------------------------------------
// Signup outcome — the duplicate-account case
// ---------------------------------------------------------------------------

test("a session means the user is signed in", () => {
  assert.equal(
    describeSignupOutcome({ session: { access_token: "x" }, user: null }),
    "signed_in"
  );
});

test("REGRESSION: an empty identities array means the address already exists", () => {
  // Supabase returns a decoy user with no identities rather than erroring, to
  // prevent enumeration. The old form read this as success and pushed the user
  // at the dashboard, where middleware bounced them back to login.
  assert.equal(
    describeSignupOutcome({ session: null, user: { identities: [] } }),
    "already_registered"
  );
});

test("a genuinely new signup needs confirmation", () => {
  assert.equal(
    describeSignupOutcome({
      session: null,
      user: { identities: [{ id: "abc" }] },
    }),
    "confirmation_required"
  );
});

test("a missing or malformed user falls back to confirmation required", () => {
  // Safer than claiming the address exists on incomplete data.
  assert.equal(
    describeSignupOutcome({ session: null, user: null }),
    "confirmation_required"
  );
  assert.equal(
    describeSignupOutcome({ session: null, user: { identities: null } }),
    "confirmation_required"
  );
});

// ---------------------------------------------------------------------------
// Account enumeration — the exact regression that shipped
// ---------------------------------------------------------------------------

/** Wording that would tell a prober an address is registered. */
const ENUMERATION_PHRASES = [
  "account already exists",
  "already exists",
  "already registered",
  "already been registered",
  "user already",
  "email is registered",
  "account exists for",
  "this email is taken",
];

function assertNoEnumeration(text, label) {
  for (const phrase of ENUMERATION_PHRASES) {
    assert.ok(
      !text.toLowerCase().includes(phrase),
      `${label} leaks account existence via "${phrase}": ${text}`
    );
  }
}

test("REGRESSION: the duplicate and confirmation screens are byte-identical", () => {
  // They previously shared a heading but had different bodies, which still
  // let a prober tell them apart.
  assert.deepEqual(
    SIGNUP_MESSAGES.already_registered,
    SIGNUP_MESSAGES.confirmation_required
  );
});

test("REGRESSION: no signup message reveals that an account exists", () => {
  for (const [outcome, message] of Object.entries(SIGNUP_MESSAGES)) {
    assertNoEnumeration(message.title, `${outcome} title`);
    assertNoEnumeration(message.body, `${outcome} body`);
  }
});

test("REGRESSION: 'An account already exists for that email.' cannot be produced", () => {
  // This exact toast is what shipped. Every shape Supabase reports a duplicate
  // in must now collapse to something ambiguous.
  const duplicateErrors = [
    { code: "user_already_exists" },
    { message: "User already registered" },
    { message: "A user with this email address has already been registered" },
    { code: "user_already_exists", message: "User already registered" },
  ];

  for (const error of duplicateErrors) {
    assertNoEnumeration(describeAuthError(error), "describeAuthError");
  }
});

test("REGRESSION: no auth copy anywhere leaks account existence", () => {
  const everything = [
    ...Object.values(AUTH_NOTICES),
    ...Object.values(SIGNUP_MESSAGES).flatMap((m) => [m.title, m.body]),
  ];

  for (const text of everything) {
    assertNoEnumeration(text, "auth copy");
  }
});

test("duplicate signup errors are detected in every shape Supabase sends", () => {
  assert.equal(isDuplicateSignupError({ code: "user_already_exists" }), true);
  assert.equal(
    isDuplicateSignupError({ message: "User already registered" }),
    true
  );
  assert.equal(
    isDuplicateSignupError({
      message: "A user with this email address has already been registered",
    }),
    true
  );
});

test("ordinary failures are not mistaken for duplicates", () => {
  // Misrouting a real error to the ambiguous screen would hide genuine
  // problems from the user.
  assert.equal(isDuplicateSignupError({ code: "weak_password" }), false);
  assert.equal(isDuplicateSignupError({ code: "validation_failed" }), false);
  assert.equal(isDuplicateSignupError(new Error("network down")), false);
  assert.equal(isDuplicateSignupError(null), false);
  assert.equal(isDuplicateSignupError(undefined), false);
  assert.equal(isDuplicateSignupError({}), false);
});

test("the ambiguous message still offers both next actions", () => {
  // Ambiguity must not cost the user a route forward.
  const body = SIGNUP_MESSAGES.already_registered.body.toLowerCase();

  assert.ok(body.includes("sign in"), "no sign-in path offered");
  assert.ok(body.includes("reset your password"), "no reset path offered");
});

// ---------------------------------------------------------------------------
// Reused / expired links while already authenticated
// ---------------------------------------------------------------------------

/**
 * Mirrors the middleware rule under test: an authenticated user on an auth
 * route is swept to the dashboard UNLESS the URL carries a link failure.
 */
function middlewareRedirectsToDashboard(isAuthenticated, url) {
  const { searchParams } = new URL(url, "https://app.example.com");
  const notice =
    searchParams.get("error") ?? searchParams.get("notice") ?? undefined;

  return isAuthenticated && !isLinkFailureNotice(notice);
}

test("REGRESSION: an authenticated user is NOT swept off an expired link", () => {
  // The reported bug: /login?error=link_expired became
  // /dashboard?error=link_expired, throwing away the explanation.
  for (const notice of [
    "link_expired",
    "link_invalid",
    "auth_callback_error",
    "recovery_expired",
  ]) {
    assert.equal(
      middlewareRedirectsToDashboard(true, `/login?error=${notice}`),
      false,
      `${notice} must hold an authenticated user on the auth page`
    );
  }
});

test("routine notices still send an authenticated user to the dashboard", () => {
  // Signing out or updating a password is not a problem to solve, so those
  // must not strand someone on the login page.
  for (const notice of ["signed_out", "password_updated", "email_confirmed"]) {
    assert.equal(
      middlewareRedirectsToDashboard(true, `/login?notice=${notice}`),
      true,
      `${notice} should not hold an authenticated user`
    );
  }
});

test("an authenticated user with no notice still goes to the dashboard", () => {
  assert.equal(middlewareRedirectsToDashboard(true, "/login"), true);
});

test("an unknown error value cannot hold a user on the auth page", () => {
  // Only the closed set counts, so a crafted ?error= cannot pin someone here.
  assert.equal(
    middlewareRedirectsToDashboard(true, "/login?error=constructor"),
    true
  );
  assert.equal(
    middlewareRedirectsToDashboard(true, "/login?error=made-up"),
    true
  );
});

test("only link failures are treated as link failures", () => {
  assert.equal(isLinkFailureNotice("link_expired"), true);
  assert.equal(isLinkFailureNotice("recovery_expired"), true);

  assert.equal(isLinkFailureNotice("password_updated"), false);
  assert.equal(isLinkFailureNotice("signed_out"), false);
  assert.equal(isLinkFailureNotice("constructor"), false);
  assert.equal(isLinkFailureNotice(undefined), false);
});

// ---------------------------------------------------------------------------
// Fragment errors — invisible to the server
// ---------------------------------------------------------------------------

test("REGRESSION: the reported fragment is read as an expired link", () => {
  // Exactly what Supabase appended in the reported URL.
  const hash =
    "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

  assert.equal(parseAuthErrorFragment(hash), "link_expired");
});

test("access_denied alone reads as expired, the usual cause on a reused link", () => {
  assert.equal(parseAuthErrorFragment("#error=access_denied"), "link_expired");
});

test("a fragment without an auth error is ignored", () => {
  assert.equal(parseAuthErrorFragment("#section=pricing"), null);
  assert.equal(parseAuthErrorFragment("#"), null);
  assert.equal(parseAuthErrorFragment(""), null);
  assert.equal(parseAuthErrorFragment(null), null);
  assert.equal(parseAuthErrorFragment(undefined), null);
});

test("a fragment error always resolves to displayable copy", () => {
  const notice = parseAuthErrorFragment("#error_code=something_unmapped");

  assert.ok(notice, "an auth error must always produce a notice");
  assert.ok(AUTH_NOTICES[notice].length > 0);
});

test("no provider text from a fragment reaches the user", () => {
  const hash =
    "#error=access_denied&error_description=AuthApiError+token+abc123+expired";
  const notice = parseAuthErrorFragment(hash);
  const copy = AUTH_NOTICES[notice];

  assert.ok(!copy.includes("abc123"), "token leaked into user copy");
  assert.ok(!copy.includes("AuthApiError"), "provider text leaked");
});

test("provider errors map consistently from query and fragment", () => {
  // The callback reads query params, the banner reads the fragment; both must
  // describe the same failure the same way.
  assert.equal(
    noticeForProviderError("otp_expired", null),
    parseAuthErrorFragment("#error_code=otp_expired")
  );
});

// ---------------------------------------------------------------------------
// Recovery redirect construction
// ---------------------------------------------------------------------------

test("recovery links route through the callback, not the destination", () => {
  // @supabase/ssr means PKCE: the emailed code must be exchanged server-side
  // before /reset-password can see a session.
  const url = buildAuthRedirectUrl(
    "https://app.example.com",
    "/reset-password"
  );

  assert.ok(url.startsWith("https://app.example.com/auth/callback?"));
  assert.ok(url.includes("next=%2Freset-password"));
});

test("the destination is encoded, not concatenated raw", () => {
  const url = buildAuthRedirectUrl("https://app.example.com", "/a b?c=d");

  assert.ok(!url.includes("/a b"));
  assert.equal(url.split("?").length, 2, "must not create a second query");
});

test("a trailing slash on the origin does not double up", () => {
  assert.equal(
    buildAuthRedirectUrl("https://app.example.com/", "/reset-password"),
    buildAuthRedirectUrl("https://app.example.com", "/reset-password")
  );
});

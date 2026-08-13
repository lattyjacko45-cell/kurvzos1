/**
 * Branch tests for private-beta presentation and support contact.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRIVATE_BETA_LABEL,
  SUPPORT_SUBJECTS,
  isPrivateBetaEnabled,
  normalizeSupportEmail,
  supportMailtoHref,
} from "./beta.ts";

// ---------------------------------------------------------------------------
// Private beta flag
// ---------------------------------------------------------------------------

test("only the exact string \"true\" enables invite-only messaging", () => {
  assert.equal(isPrivateBetaEnabled("true"), true);
});

test("anything else leaves the normal signup form in place", () => {
  // Local development must keep working without setting the variable, and a
  // typo must not silently lock the signup page.
  for (const value of [
    undefined,
    "",
    "false",
    "TRUE",
    "True",
    "1",
    "yes",
    " true ",
  ]) {
    assert.equal(
      isPrivateBetaEnabled(value),
      false,
      `${JSON.stringify(value)} should not enable private beta`
    );
  }
});

test("the label is plain product language", () => {
  assert.equal(PRIVATE_BETA_LABEL, "Private Beta");
});

// ---------------------------------------------------------------------------
// Support email presence and absence
// ---------------------------------------------------------------------------

test("a configured address is returned for use", () => {
  assert.equal(
    normalizeSupportEmail("support@kurvzos.com"),
    "support@kurvzos.com"
  );
});

test("surrounding whitespace is tolerated", () => {
  assert.equal(
    normalizeSupportEmail("  support@kurvzos.com  "),
    "support@kurvzos.com"
  );
});

test("an absent or blank value yields null so the action can be hidden", () => {
  // Null is what stops an unconfigured environment rendering "Need help?"
  // followed by nothing, or a mailto: that goes nowhere.
  assert.equal(normalizeSupportEmail(undefined), null);
  assert.equal(normalizeSupportEmail(""), null);
  assert.equal(normalizeSupportEmail("   "), null);
});

test("a malformed value is treated as absent, not rendered", () => {
  for (const value of [
    "not-an-email",
    "@kurvzos.com",
    "support@",
    "support kurvzos.com",
    "support@kurvzos",
  ]) {
    assert.equal(
      normalizeSupportEmail(value),
      null,
      `${value} should be treated as unconfigured`
    );
  }
});

// ---------------------------------------------------------------------------
// mailto construction
// ---------------------------------------------------------------------------

test("a plain mailto is produced when no subject is given", () => {
  assert.equal(
    supportMailtoHref("support@kurvzos.com"),
    "mailto:support%40kurvzos.com"
  );
});

test("the subject is encoded, not concatenated raw", () => {
  const href = supportMailtoHref("support@kurvzos.com", SUPPORT_SUBJECTS.signIn);

  assert.ok(href.startsWith("mailto:support%40kurvzos.com?subject="));
  assert.ok(!href.includes(" "), "an unencoded space would break the link");
});

test("a hostile subject cannot inject extra mail headers", () => {
  // Unencoded, a "&" or newline here would let a crafted subject append
  // cc/bcc parameters to the link.
  const href = supportMailtoHref(
    "support@kurvzos.com",
    "Hi&bcc=attacker@evil.test\nX-Header: y"
  );

  assert.ok(!href.includes("&bcc="), "header injection via subject");
  assert.ok(!href.includes("\n"), "raw newline in href");
  assert.equal(href.split("?").length, 2, "must not create a second query");
});

test("support subjects are non-empty and product-specific", () => {
  for (const [key, subject] of Object.entries(SUPPORT_SUBJECTS)) {
    assert.ok(subject.length > 0, `${key} has no subject`);
    assert.match(subject, /KurvzOS/, `${key} should identify the product`);
  }
});

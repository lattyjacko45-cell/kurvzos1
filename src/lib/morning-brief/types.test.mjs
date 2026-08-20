/**
 * Tests for the Harper Morning Brief AI response contracts.
 *
 * `ai.ts` now makes two independent kinds of request — a classification
 * batch (`{ emails: [...] }`, no recommendation) and the closing
 * recommendation (`{ recommendation: "..." }`, on its own) — instead of one
 * combined response. See `ai.ts`'s doc comment for why: batching every email
 * plus a recommendation into a single reasoning-model call was too slow to
 * finish inside a page-load timeout. `ai.ts` itself is intentionally not
 * unit tested — same reasoning as `harper/engine.server.ts` — but the
 * contract each request enforces has no such excuse, so both are covered
 * directly here: a valid, well-formed reply must parse, and the specific
 * ways a reply can go wrong (bad category, wrong types, a too-long
 * recommendation) must each be rejected rather than silently coerced.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MORNING_BRIEF_CATEGORIES,
  morningBriefEmailClassificationSchema,
  morningBriefClassificationBatchSchema,
  morningBriefRecommendationSchema,
} from "./types.ts";

function validBatch(overrides = {}) {
  return {
    emails: [
      {
        category: "MONEY_AND_ACCOUNTS",
        isActionToday: true,
        reason: "Failed payment notice from VEED.",
      },
      {
        category: "CAN_WAIT",
        isActionToday: false,
        reason: "Low priority newsletter.",
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Valid structured classification
// ---------------------------------------------------------------------------

test("a well-formed classification batch parses for every documented category", () => {
  const batch = {
    emails: MORNING_BRIEF_CATEGORIES.map((category) => ({
      category,
      isActionToday: category === "MONEY_AND_ACCOUNTS",
      reason: `Example reason for ${category}.`,
    })),
  };

  const result = morningBriefClassificationBatchSchema.safeParse(batch);

  assert.equal(result.success, true);
  assert.equal(result.data.emails.length, MORNING_BRIEF_CATEGORIES.length);
});

test("category is the single primary classification; isActionToday is a separate flag", () => {
  // A failed payment is MONEY_AND_ACCOUNTS with isActionToday true — one
  // category, plus urgency as an independent boolean, never a second
  // category or a duplicate row.
  const result = morningBriefEmailClassificationSchema.safeParse({
    category: "MONEY_AND_ACCOUNTS",
    isActionToday: true,
    reason: "Payment failed for VEED subscription.",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.data.isActionToday, true);
});

test("MORNING_BRIEF_CATEGORIES is exactly the six documented categories", () => {
  assert.deepEqual(MORNING_BRIEF_CATEGORIES, [
    "MONEY_AND_ACCOUNTS",
    "KURVZ_PROFORMANCE",
    "CAREER_AND_OPPORTUNITIES",
    "CAN_WAIT",
    "POTENTIAL_JUNK",
    "UNSUBSCRIBE_CANDIDATE",
  ]);
});

test("a well-formed recommendation parses on its own, with no emails field", () => {
  const result = morningBriefRecommendationSchema.safeParse({
    recommendation:
      "Handle the failed VEED payment first — everything else can wait. No schedule conflicts today.",
  });

  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// Malformed classification batch output — each must fail validation
// ---------------------------------------------------------------------------

test("an unknown category is rejected, not coerced to the closest match", () => {
  const result = morningBriefClassificationBatchSchema.safeParse(
    validBatch({
      emails: [
        {
          category: "URGENT", // not one of MORNING_BRIEF_CATEGORIES
          isActionToday: true,
          reason: "Looks important.",
        },
      ],
    })
  );

  assert.equal(result.success, false);
});

test("a non-boolean isActionToday is rejected", () => {
  const result = morningBriefClassificationBatchSchema.safeParse(
    validBatch({
      emails: [
        {
          category: "CAN_WAIT",
          isActionToday: "true", // string, not boolean
          reason: "Newsletter.",
        },
      ],
    })
  );

  assert.equal(result.success, false);
});

test("a missing reason is rejected", () => {
  const result = morningBriefClassificationBatchSchema.safeParse(
    validBatch({
      emails: [{ category: "CAN_WAIT", isActionToday: false }],
    })
  );

  assert.equal(result.success, false);
});

test("an empty reason is rejected", () => {
  const result = morningBriefEmailClassificationSchema.safeParse({
    category: "CAN_WAIT",
    isActionToday: false,
    reason: "",
  });

  assert.equal(result.success, false);
});

test("a missing emails array is rejected", () => {
  const result = morningBriefClassificationBatchSchema.safeParse({});

  assert.equal(result.success, false);
});

test("an empty emails array is structurally valid (count-matching against the batch is ai.ts's job)", () => {
  // The schema itself allows zero emails; classifyBatch in ai.ts rejects a
  // count mismatch against the batch it sent separately, positionally. That
  // caller-side check is what actually protects the one-category-per-email
  // guarantee end to end, not this schema alone.
  const result = morningBriefClassificationBatchSchema.safeParse(
    validBatch({ emails: [] })
  );

  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// Malformed recommendation output — each must fail validation
// ---------------------------------------------------------------------------

test("a recommendation over 500 characters is rejected", () => {
  const result = morningBriefRecommendationSchema.safeParse({
    recommendation: "x".repeat(501),
  });

  assert.equal(result.success, false);
});

test("an empty recommendation is rejected", () => {
  const result = morningBriefRecommendationSchema.safeParse({
    recommendation: "",
  });

  assert.equal(result.success, false);
});

test("a missing recommendation field is rejected", () => {
  const result = morningBriefRecommendationSchema.safeParse({});

  assert.equal(result.success, false);
});

/**
 * Branch tests for the Daily Briefing's no-mission decision.
 *
 * Run with:  npm test
 *
 * This branch has produced two separate truthfulness bugs — telling a user
 * with an out-of-tasks project that they were clear, and telling a brand-new
 * user with an empty workspace the same thing. Both are covered here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLEAR_FOR_TODAY,
  FIRST_PROJECT_PROMPT,
  nextTaskPrompt,
  noMissionRecommendation,
} from "./briefing-rules.ts";

// ---------------------------------------------------------------------------
// Empty workspace — the beta-blocking case
// ---------------------------------------------------------------------------

test("BETA: an empty workspace is told to create a project, not that it is clear", () => {
  const result = noMissionRecommendation(true, []);

  assert.equal(result, FIRST_PROJECT_PROMPT);
  assert.notEqual(result, CLEAR_FOR_TODAY);
});

test("BETA: the empty-workspace prompt explains what a project unlocks", () => {
  assert.match(FIRST_PROJECT_PROMPT, /first project/i);
  assert.match(FIRST_PROJECT_PROMPT, /what to do next/i);
});

test("empty workspace outranks everything else", () => {
  // An empty workspace has no active projects either, so this guards the
  // precedence rather than a realistic combination.
  assert.equal(noMissionRecommendation(true, ["Ghost"]), FIRST_PROJECT_PROMPT);
});

// ---------------------------------------------------------------------------
// Planning gap — the original contradiction
// ---------------------------------------------------------------------------

test("REGRESSION: an active project with no tasks asks for the next task", () => {
  const result = noMissionRecommendation(false, ["KurvzOS"]);

  assert.equal(result, nextTaskPrompt("KurvzOS"));
  assert.notEqual(result, CLEAR_FOR_TODAY);
  assert.notEqual(result, FIRST_PROJECT_PROMPT);
});

test("REGRESSION: the first listed project is the one named", () => {
  // The briefing orders these by most recently updated; the wording must
  // follow that order rather than picking arbitrarily.
  assert.equal(
    noMissionRecommendation(false, ["Side Bets", "KurvzOS"]),
    nextTaskPrompt("Side Bets")
  );
});

test("the next-task wording matches the CEO Packet exactly", () => {
  assert.equal(nextTaskPrompt("Alpha"), "Create the next task for “Alpha”.");
});

// ---------------------------------------------------------------------------
// Genuinely clear
// ---------------------------------------------------------------------------

test("a populated workspace with nothing outstanding is clear", () => {
  assert.equal(noMissionRecommendation(false, []), CLEAR_FOR_TODAY);
});

test("the three outcomes are distinct strings", () => {
  const outcomes = new Set([
    noMissionRecommendation(true, []),
    noMissionRecommendation(false, ["Alpha"]),
    noMissionRecommendation(false, []),
  ]);

  assert.equal(outcomes.size, 3, "two situations are being told the same thing");
});

test("no outcome contains owner-specific copy", () => {
  for (const result of [
    noMissionRecommendation(true, []),
    noMissionRecommendation(false, ["Alpha"]),
    noMissionRecommendation(false, []),
  ]) {
    assert.ok(
      !/latoya|proformance/i.test(result),
      `beta users must not see owner-specific copy: ${result}`
    );
  }
});

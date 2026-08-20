/**
 * Branch tests for the Harper Morning Brief deterministic recommendation.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDeterministicRecommendation } from "./recommendation.ts";

function input(over = {}) {
  return {
    actionTodayCount: 0,
    moneyCount: 0,
    hasScheduleConflict: false,
    missionTitle: null,
    missionIsOverdue: false,
    overdueTaskCount: 0,
    nextEventTitle: null,
    ...over,
  };
}

test("never exceeds three sentences", () => {
  const text = buildDeterministicRecommendation(
    input({
      actionTodayCount: 3,
      moneyCount: 2,
      hasScheduleConflict: true,
      missionTitle: "Ship the launch page",
      missionIsOverdue: true,
      nextEventTitle: "Vision Latoya Lab",
    })
  );

  const sentenceCount = text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  assert.ok(sentenceCount <= 3, `expected at most 3 sentences, got ${sentenceCount}: ${text}`);
  assert.ok(!text.includes("!"), "Harper does not use exclamation marks");
});

test("a clear inbox says so honestly rather than inventing urgency", () => {
  const text = buildDeterministicRecommendation(input());
  assert.match(text, /nothing.*needs action today/i);
});

test("mentions the mission by exact title when one exists", () => {
  const text = buildDeterministicRecommendation(
    input({ missionTitle: "Ship the launch page" })
  );
  assert.match(text, /Ship the launch page/);
});

test("flags an overdue mission distinctly from an on-time one", () => {
  const overdue = buildDeterministicRecommendation(
    input({ missionTitle: "Ship the launch page", missionIsOverdue: true })
  );
  const onTime = buildDeterministicRecommendation(
    input({ missionTitle: "Ship the launch page", missionIsOverdue: false })
  );

  assert.match(overdue, /overdue/i);
  assert.notEqual(overdue, onTime);
});

test("surfaces the schedule conflict when one exists", () => {
  const text = buildDeterministicRecommendation(input({ hasScheduleConflict: true }));
  assert.match(text, /overlap/i);
});

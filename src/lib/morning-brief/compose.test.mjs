/**
 * Branch tests for assembling the final Harper Morning Brief shape.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { composeMorningBrief } from "./compose.ts";

function sections(over = {}) {
  return {
    moneyAndAccounts: [],
    kurvzProformance: [],
    careerAndOpportunities: [],
    canWait: [],
    potentialJunk: [],
    unsubscribeCandidates: [],
    ...over,
  };
}

const EMPTY_SNAPSHOT = {
  actionTodayCount: 0,
  moneyCount: 0,
  businessCount: 0,
  careerCount: 0,
  canWaitCount: 0,
  junkCount: 0,
  unsubscribeCount: 0,
};

function baseInput(over = {}) {
  return {
    generatedAt: "2026-08-19T12:00:00.000Z",
    gmail: {
      state: "connected",
      sections: sections(),
      actionTodayItems: [],
      snapshot: EMPTY_SNAPSHOT,
    },
    calendar: {
      state: "connected",
      timeZone: "America/New_York",
      events: [],
      conflicts: [],
    },
    mission: {
      title: null,
      isOverdue: false,
      overdueCount: 0,
      dueTodayCount: 0,
    },
    recommendation: { text: "Nothing needs action today.", source: "FALLBACK" },
    ...over,
  };
}

test("no Gmail results: connected-but-empty renders honestly empty sections", () => {
  const brief = composeMorningBrief(baseInput());

  assert.equal(brief.gmailState, "connected");
  for (const key of Object.keys(brief.sections)) {
    assert.equal(brief.sections[key].length, 0);
  }
  assert.deepEqual(brief.snapshot, EMPTY_SNAPSHOT);
});

test("Gmail not connected: never shows stale or invented section content", () => {
  const money = { subject: "Payment failure", category: "MONEY_AND_ACCOUNTS", isActionToday: true };

  const brief = composeMorningBrief(
    baseInput({
      gmail: {
        state: "not_connected",
        // Even if the orchestrator somehow passed data through, a
        // disconnected source must never leak it into the composed brief.
        sections: sections({ moneyAndAccounts: [money] }),
        actionTodayItems: [money],
        snapshot: { ...EMPTY_SNAPSHOT, moneyCount: 1, actionTodayCount: 1 },
      },
    })
  );

  assert.equal(brief.gmailState, "not_connected");
  assert.equal(brief.sections.moneyAndAccounts.length, 0);
  assert.equal(brief.actionTodayItems.length, 0);
  assert.deepEqual(brief.snapshot, EMPTY_SNAPSHOT);
});

test("Gmail reconnect_required and error states also suppress section content", () => {
  for (const state of ["reconnect_required", "error"]) {
    const brief = composeMorningBrief(
      baseInput({
        gmail: {
          state,
          sections: sections({ canWait: [{ subject: "x" }] }),
          actionTodayItems: [],
          snapshot: { ...EMPTY_SNAPSHOT, canWaitCount: 1 },
        },
      })
    );

    assert.equal(brief.gmailState, state);
    assert.equal(brief.sections.canWait.length, 0, `state=${state}`);
  }
});

test("no Calendar results: not connected clears events and conflicts", () => {
  const brief = composeMorningBrief(
    baseInput({
      calendar: {
        state: "not_connected",
        timeZone: "UTC",
        events: [{ title: "Ghost event", displayTime: "9:00 AM", allDay: false, inProgress: false, startsAt: null }],
        conflicts: [{ earlier: { title: "A", startsAt: "x", endsAt: "y" }, later: { title: "B", startsAt: "x", endsAt: "y" }, overlapMinutes: 5, suggestion: "x" }],
      },
    })
  );

  assert.equal(brief.calendarState, "not_connected");
  assert.deepEqual(brief.schedule.events, []);
  assert.deepEqual(brief.schedule.conflicts, []);
});

test("a connected calendar with a real conflict passes it through untouched", () => {
  const conflict = {
    earlier: { title: "Vision Latoya Lab", startsAt: "a", endsAt: "b" },
    later: { title: "Work", startsAt: "c", endsAt: "d" },
    overlapMinutes: 30,
    suggestion: "shorten one of them",
  };

  const brief = composeMorningBrief(
    baseInput({
      calendar: { state: "connected", timeZone: "America/New_York", events: [], conflicts: [conflict] },
    })
  );

  assert.deepEqual(brief.schedule.conflicts, [conflict]);
});

test("provider error on both sources still returns a renderable brief, not a throw", () => {
  assert.doesNotThrow(() => {
    const brief = composeMorningBrief(
      baseInput({
        gmail: { state: "error", sections: sections(), actionTodayItems: [], snapshot: EMPTY_SNAPSHOT },
        calendar: { state: "error", timeZone: "UTC", events: [], conflicts: [] },
      })
    );

    assert.equal(brief.gmailState, "error");
    assert.equal(brief.calendarState, "error");
    assert.ok(brief.recommendation.text.length > 0);
  });
});

test("mission and recommendation pass through unchanged", () => {
  const brief = composeMorningBrief(
    baseInput({
      mission: { title: "Ship the launch page", isOverdue: true, overdueCount: 2, dueTodayCount: 1 },
      recommendation: { text: "Handle the overdue items first.", source: "AI" },
    })
  );

  assert.equal(brief.mission.title, "Ship the launch page");
  assert.equal(brief.mission.isOverdue, true);
  assert.equal(brief.recommendation.source, "AI");
});

/**
 * Branch tests for Harper Morning Brief schedule conflict detection.
 *
 * Run with:  npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { detectScheduleConflicts } from "./schedule-conflicts.ts";

function timed(title, startsAt, endsAt) {
  return { title, startsAt, endsAt, allDay: false };
}

function allDay(title) {
  return { title, startsAt: null, endsAt: null, allDay: true };
}

test("a conflicting early work shift produces a schedule adjustment recommendation", () => {
  const events = [
    timed("Vision Latoya Lab", "2026-08-19T14:00:00.000Z", "2026-08-19T16:00:00.000Z"),
    timed("Work", "2026-08-19T15:30:00.000Z", "2026-08-19T22:00:00.000Z"),
  ];

  const conflicts = detectScheduleConflicts(events);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].earlier.title, "Vision Latoya Lab");
  assert.equal(conflicts[0].later.title, "Work");
  assert.equal(conflicts[0].overlapMinutes, 30);
  assert.match(conflicts[0].suggestion, /Work/);
  assert.match(conflicts[0].suggestion, /Vision Latoya Lab/);
});

test("a normal, non-overlapping day raises no false conflict warning", () => {
  const events = [
    timed("Gym", "2026-08-19T12:30:00.000Z", "2026-08-19T13:30:00.000Z"),
    timed("Vision Latoya Lab", "2026-08-19T14:00:00.000Z", "2026-08-19T15:00:00.000Z"),
    timed("Content + Daily Stories", "2026-08-19T15:00:00.000Z", "2026-08-19T16:00:00.000Z"),
    timed("KurvzOS Build Block", "2026-08-19T17:00:00.000Z", "2026-08-19T19:00:00.000Z"),
    timed("Work", "2026-08-19T22:30:00.000Z", "2026-08-20T02:00:00.000Z"),
  ];

  assert.deepEqual(detectScheduleConflicts(events), []);
});

test("all-day events never trigger a conflict", () => {
  const events = [allDay("Company holiday"), allDay("Out of office")];

  assert.deepEqual(detectScheduleConflicts(events), []);
});

test("an all-day event does not conflict with an overlapping timed event", () => {
  const events = [
    allDay("Company holiday"),
    timed("Work", "2026-08-19T15:00:00.000Z", "2026-08-19T22:00:00.000Z"),
  ];

  assert.deepEqual(detectScheduleConflicts(events), []);
});

test("back-to-back events with no overlap are not a conflict", () => {
  const events = [
    timed("Gym", "2026-08-19T12:00:00.000Z", "2026-08-19T13:00:00.000Z"),
    timed("Vision Latoya Lab", "2026-08-19T13:00:00.000Z", "2026-08-19T14:00:00.000Z"),
  ];

  assert.deepEqual(detectScheduleConflicts(events), []);
});

test("three-way overlap reports every overlapping pair", () => {
  const events = [
    timed("A", "2026-08-19T10:00:00.000Z", "2026-08-19T12:00:00.000Z"),
    timed("B", "2026-08-19T10:30:00.000Z", "2026-08-19T11:30:00.000Z"),
    timed("C", "2026-08-19T11:00:00.000Z", "2026-08-19T13:00:00.000Z"),
  ];

  const conflicts = detectScheduleConflicts(events);
  const pairs = conflicts.map((c) => `${c.earlier.title}-${c.later.title}`).sort();

  assert.deepEqual(pairs, ["A-B", "A-C", "B-C"]);
});

test("empty schedule produces no conflicts", () => {
  assert.deepEqual(detectScheduleConflicts([]), []);
});

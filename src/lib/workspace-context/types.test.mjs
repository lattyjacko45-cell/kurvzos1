/**
 * Branch tests for the unified Connected Workspace snapshot.
 *
 * Run with:  npm test
 *
 * A .mjs file for the same reason as the other pure-module tests: Node's type
 * stripping needs the explicit "./types.ts" specifier, and permitting that in
 * TypeScript would require allowImportingTsExtensions, which changes how the
 * Prisma generator emits its own imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WORKSPACE_CONTEXT_CAPS,
  buildProjectsSlice,
  buildTasksSlice,
  buildWorkspaceSummary,
  capList,
  emptyWorkspaceContext,
  hasSummaryContent,
  isSourceUsable,
  mapSourceState,
  truncate,
} from "./types.ts";

const NOW_ISO = "2026-08-11T09:42:00.000Z";

/** A snapshot with every source connected and saying something. */
function context(over = {}) {
  const base = emptyWorkspaceContext(NOW_ISO);

  return {
    ...base,
    ...over,
    calendar: { ...base.calendar, ...(over.calendar ?? {}) },
    gmail: { ...base.gmail, ...(over.gmail ?? {}) },
    drive: { ...base.drive, ...(over.drive ?? {}) },
    content: { ...base.content, ...(over.content ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// mapSourceState — the shared availability vocabulary
// ---------------------------------------------------------------------------

test("maps each reader state onto the shared vocabulary", () => {
  assert.equal(mapSourceState("not_connected", false), "disconnected");
  assert.equal(mapSourceState("reconnect_required", false), "needs_reconnect");
  assert.equal(mapSourceState("error", false), "unavailable");
});

test("connected splits into connected and empty on whether there is data", () => {
  assert.equal(mapSourceState("connected", true), "connected");
  assert.equal(mapSourceState("connected", false), "empty");
});

test("a disconnected source is never reported as connected, even with stale data", () => {
  // The readers can serve a stale list during an outage; that must not make
  // the source look healthy.
  assert.equal(mapSourceState("reconnect_required", true), "needs_reconnect");
  assert.equal(mapSourceState("error", true), "unavailable");
  assert.equal(mapSourceState("not_connected", true), "disconnected");
});

test("only 'connected' counts as usable", () => {
  assert.equal(isSourceUsable("connected"), true);

  for (const state of [
    "disconnected",
    "unavailable",
    "needs_reconnect",
    "empty",
  ]) {
    assert.equal(isSourceUsable(state), false, `${state} should not be usable`);
  }
});

// ---------------------------------------------------------------------------
// Caps and truncation
// ---------------------------------------------------------------------------

test("every cap is a small positive integer", () => {
  for (const [name, value] of Object.entries(WORKSPACE_CONTEXT_CAPS)) {
    assert.ok(Number.isInteger(value), `${name} must be an integer`);
    assert.ok(value > 0, `${name} must be positive`);
    assert.ok(value <= 200, `${name} is too large for a prompt`);
  }
});

test("capList never returns more than the cap and never mutates", () => {
  const source = [1, 2, 3, 4, 5];

  assert.deepEqual(capList(source, 3), [1, 2, 3]);
  assert.deepEqual(capList(source, 0), []);
  assert.deepEqual(capList(source, -1), []);
  assert.deepEqual(capList(source, 99), source);
  assert.deepEqual(source, [1, 2, 3, 4, 5], "input was mutated");
});

test("truncate leaves short text alone and marks long text", () => {
  assert.equal(truncate("short", 20), "short");
  assert.equal(truncate("  padded  ", 20), "padded");

  const long = truncate("x".repeat(50), 10);
  assert.equal(long.length, 10);
  assert.ok(long.endsWith("…"));
});

// ---------------------------------------------------------------------------
// Tasks and projects — regression protection for the next-task fix
// ---------------------------------------------------------------------------

test("the tasks slice reshapes the briefing without re-selecting a mission", () => {
  const slice = buildTasksSlice({
    missionTitle: "Ship the alpha",
    currentStepTitle: "Write the release notes",
    overdueCount: 2,
    dueTodayCount: 1,
    projectsNeedingNextTask: [],
  });

  assert.equal(slice.state, "connected");
  assert.equal(slice.mission, "Ship the alpha");
  assert.equal(slice.currentStep, "Write the release notes");
  assert.equal(slice.overdue, 2);
  assert.equal(slice.dueToday, 1);
  assert.equal(slice.openTasks, 3);
});

test("no mission means the tasks slice is empty, not connected", () => {
  const slice = buildTasksSlice({
    missionTitle: null,
    currentStepTitle: null,
    overdueCount: 0,
    dueTodayCount: 0,
    projectsNeedingNextTask: [],
  });

  assert.equal(slice.state, "empty");
  assert.equal(slice.mission, null);
});

test("REGRESSION: projectsNeedingNextTask survives aggregation in order", () => {
  // This list is what fixed the "you're clear for today" contradiction.
  // Re-deriving or reordering it here is exactly how that bug would return.
  const slice = buildProjectsSlice({
    missionTitle: null,
    currentStepTitle: null,
    overdueCount: 0,
    dueTodayCount: 0,
    // Deliberately NOT alphabetical: the briefing orders these by most
    // recently updated, and any re-sorting here must fail this test.
    projectsNeedingNextTask: ["Side Bets", "KurvzOS", "Archive Cleanup"],
  });

  assert.equal(slice.state, "connected");
  assert.deepEqual(slice.needingNextTask, [
    "Side Bets",
    "KurvzOS",
    "Archive Cleanup",
  ]);
  assert.equal(slice.active, 3);
});

test("REGRESSION: an empty needs-next-task list never fabricates one", () => {
  const slice = buildProjectsSlice({
    missionTitle: "Ship the alpha",
    currentStepTitle: null,
    overdueCount: 0,
    dueTodayCount: 0,
    projectsNeedingNextTask: [],
  });

  assert.equal(slice.state, "empty");
  assert.deepEqual(slice.needingNextTask, []);
});

test("the projects list is capped but the true count is preserved", () => {
  const many = Array.from({ length: 12 }, (_, index) => `Project ${index}`);
  const slice = buildProjectsSlice({
    missionTitle: null,
    currentStepTitle: null,
    overdueCount: 0,
    dueTodayCount: 0,
    projectsNeedingNextTask: many,
  });

  assert.equal(
    slice.needingNextTask.length,
    WORKSPACE_CONTEXT_CAPS.projectsNeedingNextTask
  );
  assert.equal(slice.active, 12, "the real count must not be lost to the cap");
});

// ---------------------------------------------------------------------------
// Summary building — what reaches the dashboard strip
// ---------------------------------------------------------------------------

test("a fully connected snapshot summarises every source", () => {
  const summary = buildWorkspaceSummary(
    context({
      calendar: {
        state: "connected",
        nextEvent: "Investor call",
        nextEventTime: "2:00 PM",
      },
      gmail: { state: "connected", unreadCount: 3 },
      drive: {
        state: "connected",
        recent: [{ name: "Deck", typeLabel: "Google Slides", modifiedAt: NOW_ISO, url: null }],
      },
      content: {
        state: "connected",
        needingAttention: [{ title: "Friday video", status: "FAILED" }],
      },
    })
  );

  assert.equal(summary.nextEvent, "Investor call · 2:00 PM");
  assert.equal(summary.unreadMessages, 3);
  assert.equal(summary.recentDriveFiles, 1);
  assert.equal(summary.contentNeedingAttention, 1);
  assert.deepEqual(summary.needsReconnect, []);
  assert.equal(hasSummaryContent(summary), true);
});

test("disconnected sources contribute nothing to the summary", () => {
  const summary = buildWorkspaceSummary(
    context({
      calendar: { state: "disconnected", nextEvent: "Ignored" },
      gmail: { state: "disconnected", unreadCount: 9 },
      drive: {
        state: "disconnected",
        recent: [{ name: "x", typeLabel: "File", modifiedAt: NOW_ISO, url: null }],
      },
      content: { state: "empty" },
    })
  );

  assert.equal(summary.nextEvent, null);
  assert.equal(summary.unreadMessages, null);
  assert.equal(summary.recentDriveFiles, null);
  assert.equal(summary.contentNeedingAttention, null);
  assert.equal(hasSummaryContent(summary), false);
});

test("a zero unread count is not news", () => {
  const summary = buildWorkspaceSummary(
    context({ gmail: { state: "connected", unreadCount: 0 } })
  );

  assert.equal(summary.unreadMessages, null);
});

test("a next event with no time still renders", () => {
  const summary = buildWorkspaceSummary(
    context({
      calendar: { state: "connected", nextEvent: "All-day offsite", nextEventTime: null },
    })
  );

  assert.equal(summary.nextEvent, "All-day offsite");
});

test("sources needing reconnection are named, and only those", () => {
  const summary = buildWorkspaceSummary(
    context({
      calendar: { state: "needs_reconnect" },
      gmail: { state: "unavailable" },
      drive: { state: "needs_reconnect" },
    })
  );

  assert.deepEqual(summary.needsReconnect, ["Calendar", "Drive"]);
  // An outage is not the user's problem to fix, so it is not surfaced here.
  assert.ok(!summary.needsReconnect.includes("Gmail"));
  assert.equal(hasSummaryContent(summary), true);
});

// ---------------------------------------------------------------------------
// Partial failure
// ---------------------------------------------------------------------------

test("PARTIAL FAILURE: one unavailable source leaves the others intact", () => {
  // Gmail is down; calendar, drive and content must be unaffected.
  const snapshot = context({
    calendar: { state: "connected", nextEvent: "Standup", nextEventTime: "9:00 AM" },
    gmail: { state: "unavailable", unreadCount: 0, recent: [] },
    drive: {
      state: "connected",
      recent: [{ name: "Brief", typeLabel: "Google Doc", modifiedAt: NOW_ISO, url: null }],
    },
    content: {
      state: "connected",
      needingAttention: [{ title: "Reel", status: "UPLOADED" }],
    },
  });

  const summary = buildWorkspaceSummary(snapshot);

  assert.equal(summary.nextEvent, "Standup · 9:00 AM");
  assert.equal(summary.recentDriveFiles, 1);
  assert.equal(summary.contentNeedingAttention, 1);
  assert.equal(summary.unreadMessages, null, "a failed source must stay silent");
  assert.equal(hasSummaryContent(summary), true);
});

test("PARTIAL FAILURE: every source down still produces a valid snapshot", () => {
  const snapshot = emptyWorkspaceContext(NOW_ISO);
  const summary = buildWorkspaceSummary(snapshot);

  // No crash, no nulls where objects belong, nothing claimed.
  assert.equal(snapshot.generatedAt, NOW_ISO);
  assert.equal(snapshot.tasks.state, "unavailable");
  assert.equal(snapshot.calendar.state, "unavailable");
  assert.equal(snapshot.gmail.state, "unavailable");
  assert.equal(snapshot.drive.state, "unavailable");
  assert.equal(snapshot.content.state, "unavailable");
  assert.equal(hasSummaryContent(summary), false);
});

test("the empty snapshot exposes every slice the type promises", () => {
  const snapshot = emptyWorkspaceContext(NOW_ISO);

  assert.deepEqual(Object.keys(snapshot).sort(), [
    "calendar",
    "content",
    "drive",
    "generatedAt",
    "gmail",
    "projects",
    "tasks",
  ]);
});

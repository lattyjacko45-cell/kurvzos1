/**
 * Assembles the final Harper Morning Brief shape.
 *
 * Dependency-free on purpose, same arrangement as the other morning-brief
 * modules. This file does not classify emails or detect conflicts itself —
 * it receives already-classified sections and already-detected conflicts
 * from the orchestrator (`morning-brief.server.ts`) and decides what is
 * truthful to show for each source's connection state.
 *
 * The shapes below are declared structurally rather than imported from
 * `classify.ts` / `schedule-conflicts.ts`, deliberately — the same reason
 * `workspace-context/types.ts` declares `BriefingLike` instead of importing
 * `DailyBriefing`. Two testable `.ts` modules cannot import one another
 * without an extension Node's loader can resolve but `tsc` (without
 * `allowImportingTsExtensions`) rejects; duplicating a half-dozen field names
 * keeps every module independently testable. The real `classify.ts` output
 * satisfies these structurally, so nothing is lost at the call site.
 */

export type MorningBriefSourceState =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error";

export interface SectionsLike<T> {
  moneyAndAccounts: T[];
  kurvzProformance: T[];
  careerAndOpportunities: T[];
  canWait: T[];
  potentialJunk: T[];
  unsubscribeCandidates: T[];
}

export interface InboxSnapshotLike {
  actionTodayCount: number;
  moneyCount: number;
  businessCount: number;
  careerCount: number;
  canWaitCount: number;
  junkCount: number;
  unsubscribeCount: number;
}

function emptySections<T>(): SectionsLike<T> {
  return {
    moneyAndAccounts: [],
    kurvzProformance: [],
    careerAndOpportunities: [],
    canWait: [],
    potentialJunk: [],
    unsubscribeCandidates: [],
  };
}

const EMPTY_SNAPSHOT: InboxSnapshotLike = {
  actionTodayCount: 0,
  moneyCount: 0,
  businessCount: 0,
  careerCount: 0,
  canWaitCount: 0,
  junkCount: 0,
  unsubscribeCount: 0,
};

export interface ScheduleEventLike {
  title: string;
  displayTime: string;
  allDay: boolean;
  inProgress: boolean;
  startsAt: string | null;
}

export interface ScheduleConflictLike {
  earlier: { title: string; startsAt: string; endsAt: string };
  later: { title: string; startsAt: string; endsAt: string };
  overlapMinutes: number;
  suggestion: string;
}

export interface MissionSummary {
  title: string | null;
  isOverdue: boolean;
  overdueCount: number;
  dueTodayCount: number;
}

export interface ComposeMorningBriefInput<T> {
  generatedAt: string;
  gmail: {
    state: MorningBriefSourceState;
    sections: SectionsLike<T>;
    actionTodayItems: T[];
    snapshot: InboxSnapshotLike;
  };
  calendar: {
    state: MorningBriefSourceState;
    timeZone: string;
    events: ScheduleEventLike[];
    conflicts: ScheduleConflictLike[];
  };
  mission: MissionSummary;
  recommendation: {
    text: string;
    source: "AI" | "FALLBACK";
  };
}

export interface MorningBrief<T> {
  generatedAt: string;
  gmailState: MorningBriefSourceState;
  calendarState: MorningBriefSourceState;
  sections: SectionsLike<T>;
  actionTodayItems: T[];
  snapshot: InboxSnapshotLike;
  schedule: {
    events: ScheduleEventLike[];
    conflicts: ScheduleConflictLike[];
    timeZone: string;
  };
  mission: MissionSummary;
  recommendation: {
    text: string;
    source: "AI" | "FALLBACK";
  };
}

/**
 * True only when a source is actually usable. "empty" is not a state this
 * module invents — an empty inbox is `connected` with zero items, which is
 * real information; `not_connected` / `reconnect_required` / `error` are the
 * cases where showing zero items would be a lie about why the list is empty.
 */
function isUsable(state: MorningBriefSourceState): boolean {
  return state === "connected";
}

/**
 * Composes the brief. Every field is present regardless of connection
 * state — the page decides what message to show for a disconnected or
 * errored source, but the data shape itself never changes underneath it.
 */
export function composeMorningBrief<T>(
  input: ComposeMorningBriefInput<T>
): MorningBrief<T> {
  const gmailUsable = isUsable(input.gmail.state);
  const calendarUsable = isUsable(input.calendar.state);

  return {
    generatedAt: input.generatedAt,
    gmailState: input.gmail.state,
    calendarState: input.calendar.state,
    sections: gmailUsable ? input.gmail.sections : emptySections<T>(),
    actionTodayItems: gmailUsable ? input.gmail.actionTodayItems : [],
    snapshot: gmailUsable ? input.gmail.snapshot : EMPTY_SNAPSHOT,
    schedule: {
      events: calendarUsable ? input.calendar.events : [],
      conflicts: calendarUsable ? input.calendar.conflicts : [],
      timeZone: input.calendar.timeZone,
    },
    mission: input.mission,
    recommendation: input.recommendation,
  };
}

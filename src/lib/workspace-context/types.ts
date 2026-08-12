/**
 * The unified Connected Workspace snapshot.
 *
 * Deliberately dependency-free — no Prisma, no Next, no `@/` alias, no network
 * — so the branch tests run directly under Node's type stripping and client
 * components can import the types. The server aggregator in
 * `context.server.ts` is the only thing that touches the read layers.
 *
 * This file is also the single place every cap lives. If a prompt is getting
 * expensive or a source is too chatty, WORKSPACE_CONTEXT_CAPS is the one knob.
 */

/**
 * Every cap applied to the snapshot, in one place.
 *
 * These are deliberately small. The snapshot is executive awareness, not a
 * data export: Harper needs to know a meeting is coming and that three
 * messages are unread, not to read the inbox.
 */
export const WORKSPACE_CONTEXT_CAPS = {
  /** Today's events listed by title. */
  calendarTodayEvents: 5,
  /** Recent messages, unread first. */
  gmailMessages: 5,
  /** Characters kept from a message preview. */
  gmailSnippetChars: 160,
  /** Recently modified files. */
  driveFiles: 5,
  /** Content items flagged as needing a decision. */
  contentNeedingAttention: 5,
  /** Recently published content items. */
  contentRecentlyPublished: 3,
  /** Characters kept from any single title or subject. */
  titleChars: 120,
  /** Active projects with no actionable task left. */
  projectsNeedingNextTask: 5,
} as const;

/**
 * Normalized availability of one source.
 *
 * Deliberately reuses the vocabulary the Calendar, Gmail and Drive readers
 * already speak, plus "empty" for the connected-but-nothing-to-say case, so
 * there is one word for one condition across the whole app.
 */
export type SourceState =
  | "connected"
  | "disconnected"
  | "unavailable"
  | "needs_reconnect"
  | "empty";

/** The read states the existing Calendar, Gmail and Drive layers return. */
export type IntegrationReadState =
  | "connected"
  | "not_connected"
  | "reconnect_required"
  | "error";

/**
 * Maps an existing reader's state onto the shared vocabulary.
 *
 * `hasData` splits "connected" into connected and empty, which is the
 * distinction the UI and Harper actually care about: a connected-but-silent
 * source should say nothing rather than render a hopeful heading.
 */
export function mapSourceState(
  readState: IntegrationReadState,
  hasData: boolean
): SourceState {
  switch (readState) {
    case "not_connected":
      return "disconnected";
    case "reconnect_required":
      return "needs_reconnect";
    case "error":
      return "unavailable";
    case "connected":
      return hasData ? "connected" : "empty";
    default:
      return "unavailable";
  }
}

/** True when a source has something worth showing or reasoning about. */
export function isSourceUsable(state: SourceState): boolean {
  return state === "connected";
}

/** Trims a string to a cap without leaving a dangling ellipsis on short text. */
export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;

  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Takes at most `max` items. Never mutates the input. */
export function capList<T>(items: readonly T[], max: number): T[] {
  return items.slice(0, Math.max(0, max));
}

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

export interface WorkspaceTasksContext {
  state: SourceState;
  /** The Daily Briefing's chosen mission. Never recomputed here. */
  mission: string | null;
  currentStep: string | null;
  openTasks: number;
  overdue: number;
  dueToday: number;
}

export interface WorkspaceProjectsContext {
  state: SourceState;
  active: number;
  /** Active projects that have run out of actionable tasks. */
  needingNextTask: string[];
}

export interface WorkspaceCalendarEvent {
  title: string;
  /** Formatted in the calendar's zone, e.g. "2:00 PM". */
  displayTime: string;
  allDay: boolean;
}

export interface WorkspaceCalendarContext {
  state: SourceState;
  timeZone: string;
  currentEvent: string | null;
  nextEvent: string | null;
  nextEventTime: string | null;
  minutesUntilNextEvent: number | null;
  eventsRemainingToday: number;
  largestFreeGapMinutes: number | null;
  today: WorkspaceCalendarEvent[];
}

export interface WorkspaceMessage {
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
}

export interface WorkspaceGmailContext {
  state: SourceState;
  unreadCount: number;
  recentCount: number;
  recent: WorkspaceMessage[];
}

export interface WorkspaceDriveFile {
  name: string;
  typeLabel: string;
  modifiedAt: string;
  url: string | null;
}

export interface WorkspaceDriveContext {
  state: SourceState;
  recent: WorkspaceDriveFile[];
}

export interface WorkspaceContentItem {
  title: string;
  status: string;
}

export interface WorkspaceContentContext {
  state: SourceState;
  scheduled: number;
  processing: number;
  /** Failed uploads and finished-but-unscheduled videos. */
  needingAttention: WorkspaceContentItem[];
  recentlyPublished: WorkspaceContentItem[];
}

/**
 * One read-only snapshot of everything KurvzOS can see right now.
 *
 * Every field is a plain scalar or a small array of plain scalars. No Google
 * objects, no Prisma rows, no ids, no tokens, no email addresses, no file
 * links to anything the user did not already have access to.
 */
export interface ConnectedWorkspaceContext {
  generatedAt: string;
  tasks: WorkspaceTasksContext;
  projects: WorkspaceProjectsContext;
  calendar: WorkspaceCalendarContext;
  gmail: WorkspaceGmailContext;
  drive: WorkspaceDriveContext;
  content: WorkspaceContentContext;
}

// ---------------------------------------------------------------------------
// Task and project slices
// ---------------------------------------------------------------------------

/**
 * The subset of a Daily Briefing this module reads.
 *
 * Declared structurally rather than importing `DailyBriefing` so this file
 * stays free of the `@/` alias and therefore testable. The server aggregator
 * passes a real briefing, which satisfies this shape.
 */
export interface BriefingLike {
  missionTitle: string | null;
  currentStepTitle: string | null;
  overdueCount: number;
  dueTodayCount: number;
  projectsNeedingNextTask: readonly string[];
}

/**
 * Maps an already-computed briefing onto the tasks slice.
 *
 * This deliberately does no selection of its own. The Daily Briefing's mission
 * selector stays the single source of truth for "what am I working on" — this
 * only reshapes and truncates what it decided.
 */
export function buildTasksSlice(
  briefing: BriefingLike
): WorkspaceTasksContext {
  return {
    state: briefing.missionTitle ? "connected" : "empty",
    mission: briefing.missionTitle
      ? truncate(briefing.missionTitle, WORKSPACE_CONTEXT_CAPS.titleChars)
      : null,
    currentStep: briefing.currentStepTitle
      ? truncate(briefing.currentStepTitle, WORKSPACE_CONTEXT_CAPS.titleChars)
      : null,
    openTasks: briefing.overdueCount + briefing.dueTodayCount,
    overdue: briefing.overdueCount,
    dueToday: briefing.dueTodayCount,
  };
}

/**
 * Maps an already-computed briefing onto the projects slice.
 *
 * `projectsNeedingNextTask` is passed through in the briefing's own order and
 * capped — never re-derived. That list is what fixed the "you're clear for
 * today" contradiction, and recomputing it here would be exactly how that
 * regression would come back.
 */
export function buildProjectsSlice(
  briefing: BriefingLike
): WorkspaceProjectsContext {
  const needingNextTask = capList(
    briefing.projectsNeedingNextTask,
    WORKSPACE_CONTEXT_CAPS.projectsNeedingNextTask
  ).map((name) => truncate(name, WORKSPACE_CONTEXT_CAPS.titleChars));

  return {
    state: needingNextTask.length > 0 ? "connected" : "empty",
    active: briefing.projectsNeedingNextTask.length,
    needingNextTask,
  };
}

// ---------------------------------------------------------------------------
// Compact summary for the Daily Briefing strip
// ---------------------------------------------------------------------------

/**
 * The handful of facts worth a single line on the dashboard.
 *
 * Null means "say nothing" — a disconnected or silent source must not occupy
 * space with an empty heading. The briefing renders only the non-null entries.
 */
export interface ConnectedWorkspaceSummary {
  nextEvent: string | null;
  unreadMessages: number | null;
  recentDriveFiles: number | null;
  contentNeedingAttention: number | null;
  /** Sources that need the user to do something before they work again. */
  needsReconnect: string[];
}

/** True when there is at least one thing to render. */
export function hasSummaryContent(
  summary: ConnectedWorkspaceSummary
): boolean {
  return (
    summary.nextEvent !== null ||
    summary.unreadMessages !== null ||
    summary.recentDriveFiles !== null ||
    summary.contentNeedingAttention !== null ||
    summary.needsReconnect.length > 0
  );
}

/**
 * Reduces the full snapshot to the dashboard strip.
 *
 * Only genuinely useful values survive: a zero unread count is not news, and
 * neither is a source that is connected but quiet. That is what keeps this one
 * line rather than four integration widgets.
 */
export function buildWorkspaceSummary(
  context: ConnectedWorkspaceContext
): ConnectedWorkspaceSummary {
  const needsReconnect: string[] = [];

  if (context.calendar.state === "needs_reconnect") needsReconnect.push("Calendar");
  if (context.gmail.state === "needs_reconnect") needsReconnect.push("Gmail");
  if (context.drive.state === "needs_reconnect") needsReconnect.push("Drive");

  const nextEvent =
    isSourceUsable(context.calendar.state) && context.calendar.nextEvent
      ? context.calendar.nextEventTime
        ? `${context.calendar.nextEvent} · ${context.calendar.nextEventTime}`
        : context.calendar.nextEvent
      : null;

  const unreadMessages =
    isSourceUsable(context.gmail.state) && context.gmail.unreadCount > 0
      ? context.gmail.unreadCount
      : null;

  const recentDriveFiles =
    isSourceUsable(context.drive.state) && context.drive.recent.length > 0
      ? context.drive.recent.length
      : null;

  const contentNeedingAttention =
    isSourceUsable(context.content.state) &&
    context.content.needingAttention.length > 0
      ? context.content.needingAttention.length
      : null;

  return {
    nextEvent,
    unreadMessages,
    recentDriveFiles,
    contentNeedingAttention,
    needsReconnect,
  };
}

/** An empty snapshot. Used when aggregation itself cannot run. */
export function emptyWorkspaceContext(
  generatedAt: string
): ConnectedWorkspaceContext {
  return {
    generatedAt,
    tasks: {
      state: "unavailable",
      mission: null,
      currentStep: null,
      openTasks: 0,
      overdue: 0,
      dueToday: 0,
    },
    projects: { state: "unavailable", active: 0, needingNextTask: [] },
    calendar: {
      state: "unavailable",
      timeZone: "UTC",
      currentEvent: null,
      nextEvent: null,
      nextEventTime: null,
      minutesUntilNextEvent: null,
      eventsRemainingToday: 0,
      largestFreeGapMinutes: null,
      today: [],
    },
    gmail: { state: "unavailable", unreadCount: 0, recentCount: 0, recent: [] },
    drive: { state: "unavailable", recent: [] },
    content: {
      state: "unavailable",
      scheduled: 0,
      processing: 0,
      needingAttention: [],
      recentlyPublished: [],
    },
  };
}

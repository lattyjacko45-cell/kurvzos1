/**
 * Focus Mode timing rules.
 *
 * The server is the source of truth: a session banks `elapsedSeconds` on every
 * pause and stamps `lastResumedAt` while running. Live elapsed time is therefore
 * derived, not stored, which means a page refresh (or a second tab) recovers the
 * exact same timer without touching localStorage.
 */

/** Length of one focus block, in minutes. */
export const FOCUS_SESSION_MINUTES = 25;

/** Copy shown as "Estimated Focus" on the mission card and focus screen. */
export const ESTIMATED_FOCUS_MINUTES = 45;

export const FOCUS_SESSION_SECONDS = FOCUS_SESSION_MINUTES * 60;

export type FocusSessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type FocusSessionAction =
  | "PAUSE"
  | "RESUME"
  | "RESET"
  | "END"
  | "CANCEL"
  | "COMPLETE_MISSION";

/** Session shape sent to the client (dates serialised as ISO strings). */
export interface FocusSessionDto {
  id: string;
  taskId: string;
  status: FocusSessionStatus;
  startedAt: string;
  endedAt: string | null;
  lastResumedAt: string | null;
  elapsedSeconds: number;
  durationMinutes: number | null;
}

/** A session is "open" when it still owns the timer. */
export function isOpenStatus(status: FocusSessionStatus): boolean {
  return status === "ACTIVE" || status === "PAUSED";
}

/**
 * Total focus seconds for a session, including the currently running interval.
 * `now` is injectable so the client can tick without re-fetching.
 */
export function computeElapsedSeconds(
  session: Pick<
    FocusSessionDto,
    "status" | "elapsedSeconds" | "lastResumedAt"
  > | null,
  now: number = Date.now()
): number {
  if (!session) return 0;

  if (session.status !== "ACTIVE" || !session.lastResumedAt) {
    return Math.max(0, session.elapsedSeconds);
  }

  const runningMs = now - new Date(session.lastResumedAt).getTime();
  const runningSeconds = Math.max(0, Math.floor(runningMs / 1000));

  return Math.max(0, session.elapsedSeconds + runningSeconds);
}

/** Seconds left in the block; clamped at zero once the block is used up. */
export function computeRemainingSeconds(elapsedSeconds: number): number {
  return Math.max(0, FOCUS_SESSION_SECONDS - elapsedSeconds);
}

/** Formats seconds as MM:SS (or HH:MM:SS past an hour). */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Duration we persist when a session ends. */
export function toDurationMinutes(elapsedSeconds: number): number {
  return Math.max(0, Math.round(elapsedSeconds / 60));
}

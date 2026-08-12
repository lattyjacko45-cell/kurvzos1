/**
 * The Daily Briefing's no-mission decision.
 *
 * Split out of `daily-briefing.ts` because that module imports through the
 * `@/` alias, which Node's type stripping cannot resolve — so the branch that
 * decides what a user with no actionable task is told was the one piece of the
 * briefing that could not be tested. It is also the piece that has produced two
 * separate truthfulness bugs, which makes it exactly the piece worth covering.
 *
 * Dependency-free on purpose. Keep it that way.
 */

export const CLEAR_FOR_TODAY = "You’re clear for today.";

/**
 * The first action for a workspace that has nothing in it yet.
 *
 * Explains why, not just what: a new user has no reason to believe a project
 * will improve anything until they are told what it unlocks.
 */
export const FIRST_PROJECT_PROMPT =
  "Create your first project so KurvzOS can begin helping you decide what to do next.";

/** Matches the CEO Packet's wording exactly so the surfaces read as one voice. */
export function nextTaskPrompt(projectName: string): string {
  return `Create the next task for “${projectName}”.`;
}

/**
 * What to say when no task is actionable.
 *
 * Three genuinely different situations, in precedence order:
 *
 *  1. EMPTY WORKSPACE — nothing has ever been created. Not a clear day and not
 *     a planning gap; there is simply nothing here yet. Checked first because
 *     an empty workspace also has no active projects, so without this it fell
 *     through to "you're clear for today" — false, and the first thing a beta
 *     user would ever read.
 *
 *  2. PLANNING GAP — an active project has run out of tasks. Saying "clear"
 *     here was the original contradiction with Harper and the CEO Packet.
 *
 *  3. GENUINELY CLEAR — work exists and none of it is outstanding.
 */
export function noMissionRecommendation(
  isEmptyWorkspace: boolean,
  projectsNeedingNextTask: readonly string[]
): string {
  if (isEmptyWorkspace) return FIRST_PROJECT_PROMPT;

  const [project] = projectsNeedingNextTask;
  if (project) return nextTaskPrompt(project);

  return CLEAR_FOR_TODAY;
}

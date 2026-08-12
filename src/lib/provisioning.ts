/**
 * New-user provisioning rules.
 *
 * Deliberately dependency-free — no Prisma, no Next, no `@/` alias — so the
 * branch tests run directly under Node's type stripping. `auth.ts` holds the
 * database calls; the decisions live here where they can be tested.
 */

/**
 * The workspace slug for a profile.
 *
 * Two properties matter, and the previous implementation had neither:
 *
 *  1. DETERMINISTIC. The same profile always produces the same slug, so two
 *     concurrent first-login requests race for one unique key instead of
 *     silently creating two workspaces. Exactly one insert can win.
 *
 *  2. COLLISION-FREE. It uses the whole profile id. The old version took
 *     `profileId.slice(0, 8)` — 32 bits of a UUID — so two different users
 *     could collide, and the loser could never be provisioned at all because
 *     `slug` is unique. Rare, but permanent and silent when it happened.
 */
export function workspaceSlugForProfile(profileId: string): string {
  return `workspace-${profileId}`;
}

/** The name every personal workspace starts with. */
export const DEFAULT_WORKSPACE_NAME = "My Workspace";

/**
 * Marks a page as having been opened from the first-run guide.
 *
 * A fixed literal flag rather than a `returnTo=<url>` parameter on purpose:
 * the destination is hard-coded in the app, so a crafted link can only ever
 * turn this on or off — it can never redirect a user somewhere of the
 * attacker's choosing. An open redirect is not a risk worth taking for a
 * convenience feature.
 */
export const ONBOARDING_PARAM = "from";
export const ONBOARDING_FLAG = "onboarding";

/** True when the page was reached from the first-run guide. */
export function isFromOnboarding(value: string | undefined): boolean {
  return value === ONBOARDING_FLAG;
}

/** Appends the onboarding flag to an in-app path. */
export function withOnboardingFlag(href: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${ONBOARDING_PARAM}=${ONBOARDING_FLAG}`;
}

/** Postgres unique-violation code, as surfaced by Prisma. */
export const UNIQUE_CONSTRAINT_CODE = "P2002";

/**
 * Whether a failed create means "someone else already provisioned this".
 *
 * A unique-constraint violation on the deterministic slug is the expected
 * outcome of losing the race, not an error: the workspace the caller wanted
 * now exists, created by the concurrent request. The caller re-reads instead
 * of failing, which is what makes provisioning idempotent.
 *
 * Narrow on purpose — any other error still propagates, because a genuine
 * database fault must not be mistaken for a benign race.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  return code === UNIQUE_CONSTRAINT_CODE;
}

/**
 * Which onboarding steps a workspace has already satisfied.
 *
 * Derived from real data rather than stored progress flags: there is no state
 * to migrate, nothing to get out of sync, and a user who deletes their only
 * project correctly sees step one again.
 */
export interface OnboardingFacts {
  projectCount: number;
  taskCount: number;
  /**
   * Whether the user has actually ASKED an executive something.
   *
   * Deliberately not "advice exists". Creating the first project pings the
   * background auto-refresh, which runs Harper and stores a conversation row —
   * so counting stored advice marked this step complete before the user had
   * ever opened the Executive Team page. A stored question is the only signal
   * here that requires a deliberate act.
   */
  hasAskedExecutive: boolean;
  /** Whether any external integration is connected. */
  hasConnectedIntegration: boolean;
}

export interface OnboardingStep {
  id: "project" | "task" | "executives" | "integrations";
  title: string;
  description: string;
  href: string;
  complete: boolean;
  /** Step 4 is genuinely optional; the first three are the core path. */
  optional: boolean;
}

/**
 * The first-run checklist.
 *
 * Four steps, in the order they unblock each other: a project gives tasks
 * somewhere to live, a task gives the Daily Briefing something to recommend,
 * and the executives need both before their advice means anything. Connecting
 * tools is last and marked optional because KurvzOS is fully usable without
 * any of them.
 */
export function buildOnboardingSteps(
  facts: OnboardingFacts
): OnboardingStep[] {
  return [
    {
      id: "project",
      title: "Create your first project",
      description:
        "A project is the container for related work. Most people start with one.",
      href: "/dashboard/projects",
      complete: facts.projectCount > 0,
      optional: false,
    },
    {
      id: "task",
      title: "Add the first task",
      description:
        "Tasks are what KurvzOS reads to decide what you should do next.",
      href: "/dashboard/tasks",
      complete: facts.taskCount > 0,
      optional: false,
    },
    {
      id: "executives",
      title: "Meet your executive team",
      // Says what actually completes the step. The previous wording implied
      // merely having advice was enough, which is how it ticked itself.
      description:
        "Five advisors read your workspace. Ask one of them a question to see how they read yours.",
      href: "/executive-team",
      complete: facts.hasAskedExecutive,
      optional: false,
    },
    {
      id: "integrations",
      title: "Connect your tools",
      description:
        "Optional. Gmail, Calendar, Drive and YouTube add context to your day.",
      href: "/dashboard/settings",
      complete: facts.hasConnectedIntegration,
      optional: true,
    },
  ];
}

/**
 * Whether the first-run guide should still be shown.
 *
 * It disappears once the required steps are done — the optional integrations
 * step never keeps it on screen, because a user who has chosen not to connect
 * anything is finished, not stuck.
 */
export function shouldShowOnboarding(steps: OnboardingStep[]): boolean {
  return steps.some((step) => !step.optional && !step.complete);
}

/** The next thing to do, or null when the required path is complete. */
export function nextOnboardingStep(
  steps: OnboardingStep[]
): OnboardingStep | null {
  return steps.find((step) => !step.optional && !step.complete) ?? null;
}

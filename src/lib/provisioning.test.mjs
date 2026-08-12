/**
 * Branch tests for new-user provisioning and first-run onboarding.
 *
 * Run with:  npm test
 *
 * A .mjs file for the same reason as the other pure-module tests: Node's type
 * stripping needs the explicit "./provisioning.ts" specifier, and permitting
 * that in TypeScript would require allowImportingTsExtensions, which changes
 * how the Prisma generator emits its own imports.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WORKSPACE_NAME,
  ONBOARDING_FLAG,
  ONBOARDING_PARAM,
  UNIQUE_CONSTRAINT_CODE,
  buildOnboardingSteps,
  isFromOnboarding,
  isUniqueConstraintError,
  nextOnboardingStep,
  shouldShowOnboarding,
  withOnboardingFlag,
  workspaceSlugForProfile,
} from "./provisioning.ts";

const PROFILE_A = "3f2b8c1e-9a44-4d7f-b0c5-1e2d3a4b5c6d";
const PROFILE_B = "3f2b8c1e-0000-0000-0000-999999999999";

function facts(over = {}) {
  return {
    projectCount: 0,
    taskCount: 0,
    hasAskedExecutive: false,
    hasConnectedIntegration: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Workspace slug — the race-safety mechanism
// ---------------------------------------------------------------------------

test("the slug is deterministic for a profile", () => {
  // Determinism is what makes concurrent creates collide on one unique key
  // instead of quietly producing two workspaces.
  assert.equal(
    workspaceSlugForProfile(PROFILE_A),
    workspaceSlugForProfile(PROFILE_A)
  );
});

test("REGRESSION: two profiles sharing a UUID prefix get different slugs", () => {
  // The old slug was profileId.slice(0, 8). These two ids share that prefix,
  // so under the old scheme the second user could never be provisioned —
  // their workspace create would fail the unique index forever.
  assert.equal(PROFILE_A.slice(0, 8), PROFILE_B.slice(0, 8));
  assert.notEqual(
    workspaceSlugForProfile(PROFILE_A),
    workspaceSlugForProfile(PROFILE_B)
  );
});

test("the slug contains the whole profile id", () => {
  assert.ok(workspaceSlugForProfile(PROFILE_A).includes(PROFILE_A));
});

test("the default workspace name is generic, not personal", () => {
  assert.equal(DEFAULT_WORKSPACE_NAME, "My Workspace");
  assert.ok(!/latoya|kurvz|proformance/i.test(DEFAULT_WORKSPACE_NAME));
});

// ---------------------------------------------------------------------------
// Unique-constraint detection — losing the race must be recoverable
// ---------------------------------------------------------------------------

test("recognises Prisma's unique-constraint violation", () => {
  assert.equal(isUniqueConstraintError({ code: UNIQUE_CONSTRAINT_CODE }), true);
  assert.equal(isUniqueConstraintError({ code: "P2002" }), true);
});

test("does not mistake other failures for a benign race", () => {
  // A real database fault must propagate, not be swallowed as "someone else
  // already created it".
  assert.equal(isUniqueConstraintError({ code: "P2003" }), false);
  assert.equal(isUniqueConstraintError(new Error("connection refused")), false);
  assert.equal(isUniqueConstraintError(null), false);
  assert.equal(isUniqueConstraintError(undefined), false);
  assert.equal(isUniqueConstraintError("P2002"), false);
  assert.equal(isUniqueConstraintError({}), false);
});

// ---------------------------------------------------------------------------
// Onboarding steps
// ---------------------------------------------------------------------------

test("a brand-new workspace has every required step outstanding", () => {
  const steps = buildOnboardingSteps(facts());

  assert.equal(steps.length, 4);
  assert.deepEqual(
    steps.map((step) => step.id),
    ["project", "task", "executives", "integrations"]
  );
  assert.equal(steps.every((step) => !step.complete), true);
  assert.equal(shouldShowOnboarding(steps), true);
  assert.equal(nextOnboardingStep(steps)?.id, "project");
});

test("steps tick themselves off from real data", () => {
  const steps = buildOnboardingSteps(
    facts({ projectCount: 1, taskCount: 3, hasAskedExecutive: true })
  );

  assert.equal(steps[0].complete, true);
  assert.equal(steps[1].complete, true);
  assert.equal(steps[2].complete, true);
  assert.equal(steps[3].complete, false);
});

test("the guide hides once the required steps are done, integrations or not", () => {
  // Choosing not to connect anything means finished, not stuck.
  const steps = buildOnboardingSteps(
    facts({ projectCount: 1, taskCount: 1, hasAskedExecutive: true })
  );

  assert.equal(shouldShowOnboarding(steps), false);
  assert.equal(nextOnboardingStep(steps), null);
});

test("only the integrations step is optional", () => {
  const steps = buildOnboardingSteps(facts());
  const optional = steps.filter((step) => step.optional).map((s) => s.id);

  assert.deepEqual(optional, ["integrations"]);
});

test("a connected integration alone does not complete onboarding", () => {
  const steps = buildOnboardingSteps(facts({ hasConnectedIntegration: true }));

  assert.equal(steps[3].complete, true);
  assert.equal(shouldShowOnboarding(steps), true);
  assert.equal(nextOnboardingStep(steps)?.id, "project");
});

test("the guide returns after the last project is deleted", () => {
  // Progress is derived, not stored, so removing the data restores the step.
  const steps = buildOnboardingSteps(
    facts({ projectCount: 0, taskCount: 0, hasAskedExecutive: true })
  );

  assert.equal(shouldShowOnboarding(steps), true);
  assert.equal(nextOnboardingStep(steps)?.id, "project");
});

test("REGRESSION: background advice does not complete the executives step", () => {
  // Creating the first project pings the auto-refresh, which runs Harper and
  // stores a conversation with no userMessage. That used to tick this step
  // before the user had ever opened the Executive Team page.
  const steps = buildOnboardingSteps(
    facts({ projectCount: 1, hasAskedExecutive: false })
  );

  const executives = steps.find((step) => step.id === "executives");

  assert.equal(executives?.complete, false);
  assert.equal(shouldShowOnboarding(steps), true);
});

test("the executives step completes only when the user has asked something", () => {
  const steps = buildOnboardingSteps(facts({ hasAskedExecutive: true }));

  assert.equal(steps.find((step) => step.id === "executives")?.complete, true);
});

test("the executives step says what actually completes it", () => {
  const steps = buildOnboardingSteps(facts());
  const executives = steps.find((step) => step.id === "executives");

  assert.match(executives?.description ?? "", /ask/i);
});

// ---------------------------------------------------------------------------
// Onboarding return navigation
// ---------------------------------------------------------------------------

test("the onboarding flag round-trips through a link", () => {
  const href = withOnboardingFlag("/dashboard/projects");

  assert.equal(href, `/dashboard/projects?${ONBOARDING_PARAM}=${ONBOARDING_FLAG}`);
  assert.equal(isFromOnboarding(new URL(href, "http://x").searchParams.get(ONBOARDING_PARAM) ?? undefined), true);
});

test("the flag appends correctly to a path that already has a query", () => {
  const href = withOnboardingFlag("/dashboard/tasks?tab=active");

  assert.ok(href.includes("tab=active"));
  assert.ok(href.includes(`${ONBOARDING_PARAM}=${ONBOARDING_FLAG}`));
  assert.equal(href.split("?").length, 2, "must not produce a second '?'");
});

test("established users are not treated as onboarding", () => {
  // Only the exact literal counts, so an ordinary visit keeps the old
  // behaviour of staying on the page after creating something.
  assert.equal(isFromOnboarding(undefined), false);
  assert.equal(isFromOnboarding(""), false);
  assert.equal(isFromOnboarding("Onboarding"), false);
  assert.equal(isFromOnboarding("onboarding-ish"), false);
});

test("the flag cannot carry a redirect target", () => {
  // A fixed literal, not a returnTo=<url>: a crafted link can only switch this
  // on or off, never choose where the user is sent.
  assert.equal(isFromOnboarding("https://evil.example.com"), false);
  assert.equal(isFromOnboarding("//evil.example.com"), false);
  assert.equal(isFromOnboarding("/dashboard"), false);
});

test("every step points at a real in-app route and says something", () => {
  for (const step of buildOnboardingSteps(facts())) {
    assert.ok(step.href.startsWith("/"), `${step.id} href must be internal`);
    assert.ok(step.title.length > 0, `${step.id} needs a title`);
    assert.ok(step.description.length > 0, `${step.id} needs a description`);
    // Beta users are not Latoya.
    assert.ok(
      !/latoya|kurvz proformance|proformance/i.test(
        `${step.title} ${step.description}`
      ),
      `${step.id} contains owner-specific copy`
    );
  }
});

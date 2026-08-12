import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  buildOnboardingSteps,
  shouldShowOnboarding,
  withOnboardingFlag,
} from "@/lib/provisioning";

interface OnboardingGuideProps {
  profileId: string;
  workspaceId: string;
}

/**
 * The first-run guide.
 *
 * Deliberately not a wizard: it is a card on the dashboard that the user can
 * ignore entirely. Nothing is gated behind it, every step is an ordinary link
 * to a page they could already reach, and it disappears on its own once the
 * required steps are done.
 *
 * Progress is derived from real rows rather than stored flags. There is no
 * onboarding state to migrate, nothing can drift out of sync, and a user who
 * deletes their only project correctly sees step one again.
 *
 * Counts only — five cheap aggregate queries, no external API calls, and it
 * renders nothing at all for an established workspace.
 */
export async function OnboardingGuide({
  profileId,
  workspaceId,
}: OnboardingGuideProps) {
  const [projectCount, taskCount, askedCount, integrations] =
    await Promise.all([
      prisma.project.count({ where: { workspaceId } }),
      prisma.task.count({ where: { project: { workspaceId } } }),
      /**
       * Only conversations the user started.
       *
       * `userMessage` is null for background refreshes, and creating the first
       * project triggers one — so counting every conversation ticked this step
       * before the user had opened the Executive Team page at all.
       */
      prisma.executiveConversation.count({
        where: { profileId, userMessage: { not: null } },
      }),
      Promise.all([
        prisma.calendarConnection.count({ where: { profileId } }),
        prisma.gmailConnection.count({ where: { profileId } }),
        prisma.driveConnection.count({ where: { profileId } }),
        prisma.youTubeConnection.count({ where: { profileId } }),
      ]),
    ]);

  const steps = buildOnboardingSteps({
    projectCount,
    taskCount,
    hasAskedExecutive: askedCount > 0,
    hasConnectedIntegration: integrations.some((count) => count > 0),
  });

  if (!shouldShowOnboarding(steps)) return null;

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="rounded-2xl border bg-card p-6"
    >
      <SectionLabel as="h2" id={"onboarding-heading"}>
        Getting started
      </SectionLabel>

      <p className="mt-2 font-serif text-heading text-foreground">
        Welcome to KurvzOS
      </p>

      <p className="mt-1 max-w-2xl text-caption text-muted-foreground">
        Four short steps to make KurvzOS useful. You can explore in any order —
        nothing here blocks the rest of the app.
      </p>

      <ol className="mt-5 divide-y">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {step.complete ? (
                  <CheckIcon className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
                  >
                    {index + 1}
                  </span>
                )}

                <span className={step.complete ? "text-muted-foreground" : ""}>
                  {step.title}
                </span>

                {step.optional ? (
                  <span className="text-xs text-muted-foreground">
                    Optional
                  </span>
                ) : null}

                {step.complete ? <span className="sr-only"> (done)</span> : null}
              </p>

              <p className="pl-6 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>

            {step.complete ? null : (
              <Link
                /* Flagged so the create dialog on the other end knows to
                   bring the user back here when they finish. */
                href={withOnboardingFlag(step.href)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

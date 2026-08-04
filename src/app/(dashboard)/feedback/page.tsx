import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FEEDBACK_TYPE_LABELS } from "@/components/feedback/feedback-dialog";
import {
  FeedbackStatusSelect,
  type FeedbackStatusValue,
} from "@/components/feedback/feedback-status-select";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Feedback",
};

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const feedback = await prisma.feedback.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Internal Alpha
        </p>

        <h1 className="text-4xl font-bold tracking-tight">Feedback</h1>

        <p className="text-muted-foreground">
          Everything you&apos;ve reported, newest first.
        </p>
      </header>

      <Separator />

      {feedback.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No feedback yet. Use Send Feedback in the sidebar while something is
          still fresh.
        </p>
      ) : (
        <ul className="space-y-4">
          {feedback.map((entry) => (
            <li
              key={entry.id}
              className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {FEEDBACK_TYPE_LABELS[entry.type]}
                  </p>

                  <p className="text-sm leading-6">{entry.description}</p>
                </div>

                <FeedbackStatusSelect
                  feedbackId={entry.id}
                  status={entry.status as FeedbackStatusValue}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{entry.page}</span>

                {entry.taskId ? (
                  <span className="font-mono">task: {entry.taskId}</span>
                ) : null}

                <span className="tabular-nums">
                  {entry.createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

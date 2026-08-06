import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAiSetupState } from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { groundAdviceLanguage } from "@/lib/marcus/safety";
import { formatPeriod, monthStart } from "@/lib/finance/money";
import { getRecentMarcusConversations } from "@/lib/marcus/engine.server";
import { getMarcusView } from "@/lib/marcus/view.server";
import {
  marcusAnswerSchema,
  type MarcusAnswer,
  type MarcusSource,
} from "@/lib/marcus/types";
import {
  MarcusWorkspace,
  type MarcusHistoryEntry,
} from "@/components/marcus/marcus-workspace";
import { FinancialSnapshotForm } from "@/components/marcus/financial-snapshot-form";

export const metadata: Metadata = {
  title: "Marcus",
};

/** Stored JSON is validated and language-cleaned on the way back out. */
function readStoredAdvice(
  value: unknown
): { advice: MarcusAnswer; source: MarcusSource } | null {
  const parsed = marcusAnswerSchema.safeParse(value);
  if (!parsed.success) return null;

  const source =
    value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === "AI"
      ? "AI"
      : "FALLBACK";

  // History is language-cleaned and grounded on the way out too.
  return {
    advice: groundAdviceLanguage(humanizeAdvice(parsed.data)),
    source,
  };
}

export default async function MarcusPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const workspace = await getUserWorkspace(profile.id);
  const aiState = getAiSetupState();
  const period = monthStart();

  const [conversations, marcusView, snapshot] = await Promise.all([
    getRecentMarcusConversations(profile.id, 10),
    getMarcusView(profile.id, workspace.id),
    // Scoped by profile: a snapshot can only ever be read by its owner.
    prisma.financialSnapshot.findUnique({
      where: {
        profileId_periodStart: { profileId: profile.id, periodStart: period },
      },
    }),
  ]);

  const history: MarcusHistoryEntry[] = conversations.flatMap((entry) => {
    const stored = readStoredAdvice(entry.response);
    if (!stored) return [];

    return [
      {
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        userMessage: entry.userMessage,
        advice: stored.advice,
        source: stored.source,
      },
    ];
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Chief Financial Officer
        </p>

        <h1 className="text-4xl font-bold tracking-tight">Marcus</h1>

        <p className="text-muted-foreground">
          Where the business should spend, save, or earn next.
        </p>
      </header>

      <FinancialSnapshotForm
        period={formatPeriod(period)}
        initial={
          snapshot
            ? {
                currency: snapshot.currency,
                revenueCents: snapshot.revenueCents,
                operatingExpensesCents: snapshot.operatingExpensesCents,
                marketingSpendCents: snapshot.marketingSpendCents,
                availableCashCents: snapshot.availableCashCents,
                targetRevenueCents: snapshot.targetRevenueCents,
                notes: snapshot.notes,
              }
            : null
        }
      />

      <MarcusWorkspace
        initialAdvice={marcusView.advice}
        initialSource={marcusView.source}
        wasStale={marcusView.wasStale}
        history={history}
        aiConfigured={aiState.configured}
        missingEnv={aiState.missing}
        missingFinancialData={marcusView.context.missingFinancialData}
      />

      <p className="text-sm">
        <Link href="/executive-team" className="underline underline-offset-4">
          Back to Executive Team
        </Link>
      </p>
    </div>
  );
}

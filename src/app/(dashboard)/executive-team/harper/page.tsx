import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { getAiSetupState } from "@/lib/ai/provider";
import { getRecentHarperConversations } from "@/lib/harper/engine.server";
import { getHarperView } from "@/lib/harper/view.server";
import {
  harperAnswerSchema,
  type HarperAnswer,
  type HarperSource,
} from "@/lib/harper/types";
import {
  HarperWorkspace,
  type HarperHistoryEntry,
} from "@/components/harper/harper-workspace";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Harper",
};

/** Stored JSON is validated on the way back out, same as on the way in. */
function readStoredAdvice(
  value: unknown
): { advice: HarperAnswer; source: HarperSource } | null {
  const parsed = harperAnswerSchema.safeParse(value);
  if (!parsed.success) return null;

  const source =
    value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === "AI"
      ? "AI"
      : "FALLBACK";

  return { advice: parsed.data, source };
}

export default async function HarperPage() {
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

  const [conversations, harperView] = await Promise.all([
    getRecentHarperConversations(profile.id, 10),
    getHarperView(profile.id, workspace.id),
  ]);

  const history: HarperHistoryEntry[] = conversations.flatMap((entry) => {
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

  // getHarperView already discarded saved advice if the workspace moved on.
  const shownAdvice = harperView.advice;
  const shownSource = harperView.source;

  return (
    <div className="mx-auto w-full max-w-focused space-y-8">
      <PageHeader
        eyebrow="Chief of Staff"
        title="Harper"
        description="One priority, one next move, grounded in your workspace."
      />

      <HarperWorkspace
        initialAdvice={shownAdvice}
        initialSource={shownSource}
        wasStale={harperView.wasStale}
        history={history}
        aiConfigured={aiState.configured}
        missingEnv={aiState.missing}
      />

      <p className="text-sm">
        <Link href="/executive-team" className="underline underline-offset-4">
          Back to Executive Team
        </Link>
      </p>
    </div>
  );
}

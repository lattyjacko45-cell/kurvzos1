import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { getAiSetupState } from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { getRecentSophiaConversations } from "@/lib/sophia/engine.server";
import { getSophiaView } from "@/lib/sophia/view.server";
import {
  sophiaAnswerSchema,
  type SophiaAnswer,
  type SophiaSource,
} from "@/lib/sophia/types";
import {
  SophiaWorkspace,
  type SophiaHistoryEntry,
} from "@/components/sophia/sophia-workspace";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Sophia",
};

/** Stored JSON is validated and language-cleaned on the way back out. */
function readStoredAdvice(
  value: unknown
): { advice: SophiaAnswer; source: SophiaSource } | null {
  const parsed = sophiaAnswerSchema.safeParse(value);
  if (!parsed.success) return null;

  const source =
    value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === "AI"
      ? "AI"
      : "FALLBACK";

  return { advice: humanizeAdvice(parsed.data), source };
}

export default async function SophiaPage() {
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

  const [conversations, sophiaView] = await Promise.all([
    getRecentSophiaConversations(profile.id, 10),
    getSophiaView(profile.id, workspace.id),
  ]);

  const history: SophiaHistoryEntry[] = conversations.flatMap((entry) => {
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
    <div className="mx-auto w-full max-w-focused space-y-8">
      <PageHeader
        eyebrow="Chief Marketing Officer"
        title="Sophia"
        description="What to publish, promote or improve to grow."
      />

      <SophiaWorkspace
        initialAdvice={sophiaView.advice}
        initialSource={sophiaView.source}
        wasStale={sophiaView.wasStale}
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

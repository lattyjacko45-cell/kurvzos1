import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { getAiSetupState } from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { getRecentOliviaConversations } from "@/lib/olivia/engine.server";
import { getOliviaView } from "@/lib/olivia/view.server";
import {
  oliviaAnswerSchema,
  type OliviaAnswer,
  type OliviaSource,
} from "@/lib/olivia/types";
import {
  OliviaWorkspace,
  type OliviaHistoryEntry,
} from "@/components/olivia/olivia-workspace";
import { ExecutiveHeader } from "@/components/executive/executive-header";

export const metadata: Metadata = {
  title: "Olivia",
};

/** Stored JSON is validated and language-cleaned on the way back out. */
function readStoredAdvice(
  value: unknown
): { advice: OliviaAnswer; source: OliviaSource } | null {
  const parsed = oliviaAnswerSchema.safeParse(value);
  if (!parsed.success) return null;

  const source =
    value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === "AI"
      ? "AI"
      : "FALLBACK";

  return { advice: humanizeAdvice(parsed.data), source };
}

export default async function OliviaPage() {
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

  const [conversations, oliviaView] = await Promise.all([
    getRecentOliviaConversations(profile.id, 10),
    getOliviaView(profile.id, workspace.id),
  ]);

  const history: OliviaHistoryEntry[] = conversations.flatMap((entry) => {
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
      <ExecutiveHeader id="OLIVIA" />

      <OliviaWorkspace
        initialAdvice={oliviaView.advice}
        initialSource={oliviaView.source}
        wasStale={oliviaView.wasStale}
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

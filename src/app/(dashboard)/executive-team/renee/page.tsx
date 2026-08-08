import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { getAiSetupState } from "@/lib/ai/provider";
import { humanizeAdvice } from "@/lib/executives/language";
import { getRecentReneeConversations } from "@/lib/renee/engine.server";
import { getReneeView } from "@/lib/renee/view.server";
import {
  reneeAnswerSchema,
  type ReneeAnswer,
  type ReneeSource,
} from "@/lib/renee/types";
import {
  ReneeWorkspace,
  type ReneeHistoryEntry,
} from "@/components/renee/renee-workspace";
import { ExecutiveHeader } from "@/components/executive/executive-header";

export const metadata: Metadata = {
  title: "Renee",
};

/** Stored JSON is validated on the way back out, same as on the way in. */
function readStoredAdvice(
  value: unknown
): { advice: ReneeAnswer; source: ReneeSource } | null {
  const parsed = reneeAnswerSchema.safeParse(value);
  if (!parsed.success) return null;

  const source =
    value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === "AI"
      ? "AI"
      : "FALLBACK";

  // History rows written before the language guard are cleaned on read.
  return { advice: humanizeAdvice(parsed.data), source };
}

export default async function ReneePage() {
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

  const [conversations, reneeView] = await Promise.all([
    getRecentReneeConversations(profile.id, 10),
    getReneeView(profile.id, workspace.id),
  ]);

  const history: ReneeHistoryEntry[] = conversations.flatMap((entry) => {
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
      <ExecutiveHeader id="RENEE" />

      <ReneeWorkspace
        initialAdvice={reneeView.advice}
        initialSource={reneeView.source}
        wasStale={reneeView.wasStale}
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

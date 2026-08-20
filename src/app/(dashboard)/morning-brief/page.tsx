import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { getMorningBrief } from "@/lib/morning-brief.server";
import { MorningBriefView } from "@/components/morning-brief/morning-brief-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Morning Brief",
};

export default async function MorningBriefPage() {
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

  const brief = await getMorningBrief(profile.id, workspace.id);

  return (
    <div className="mx-auto w-full max-w-focused space-y-8">
      <PageHeader
        eyebrow="Harper · Chief of Staff"
        title="Morning Brief"
        description="What needs attention today, what can wait, what may be junk, and what your calendar means for the day."
      />

      <MorningBriefView brief={brief} />
    </div>
  );
}

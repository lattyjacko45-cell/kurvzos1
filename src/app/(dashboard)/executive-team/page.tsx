import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { EXECUTIVES } from "@/config/executives";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Executive Team",
};

export default async function ExecutiveTeamPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-standard space-y-8">
      <PageHeader
        eyebrow="Executive Team"
        title="Your leadership"
        description="Each executive reads your KurvzOS data and advises on their area. Harper is live today."
      />

      <ul className="grid gap-4 sm:grid-cols-2">
        {EXECUTIVES.map((executive) => {
          const card = (
            <div className="h-full space-y-3 rounded-2xl border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-lg font-semibold tracking-tight">
                    {executive.name}
                  </p>

                  <SectionLabel>
                    {executive.role}
                  </SectionLabel>
                </div>

                <Badge
                  variant={executive.active ? "default" : "outline"}
                  className="h-6 shrink-0 px-3 uppercase tracking-wider"
                >
                  {executive.active ? "Active" : "Coming next"}
                </Badge>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                {executive.description}
              </p>
            </div>
          );

          return (
            <li key={executive.id}>
              {executive.active && executive.href ? (
                <Link
                  href={executive.href}
                  className="block h-full rounded-2xl transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {card}
                </Link>
              ) : (
                <div aria-disabled="true" className="h-full opacity-60">
                  {card}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

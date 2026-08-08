import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";

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
        description="Each executive reads your KurvzOS data and advises on their area."
      />

      <ul className="grid gap-5 sm:grid-cols-2">
        {EXECUTIVES.map((executive) => {
          const card = (
            /*
              flex-col + the description's flex-1 is what gives every card the
              same height without padding one out: the responsibility line
              absorbs the slack, so the route action always sits on the bottom
              edge rather than floating in an empty area.
            */
            <div className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                {/*
                  Role above name, matching the eyebrow-then-title order of the
                  workspace header, so a card and the page it opens read the
                  same way round. The name carries the display serif — the one
                  visual cue that marks these as people rather than features.
                */}
                <div className="min-w-0 space-y-1.5">
                  <SectionLabel>
                    {executive.role}
                  </SectionLabel>

                  <p className="font-serif text-heading text-foreground">
                    {executive.name}
                  </p>
                </div>

                <Badge
                  variant={executive.active ? "default" : "outline"}
                  className="h-6 shrink-0 px-3 uppercase tracking-wider"
                >
                  {executive.active ? "Active" : "Coming next"}
                </Badge>
              </div>

              <p className="flex-1 text-sm leading-6 text-muted-foreground">
                {executive.description}
              </p>

              {executive.active && executive.href ? (
                /* Restrained affordance: the whole card is already the link,
                   so this is a cue, not a second control. */
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  Open workspace
                  <ArrowRightIcon className="size-4" />
                </p>
              ) : null}
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

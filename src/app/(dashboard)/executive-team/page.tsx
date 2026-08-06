import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { EXECUTIVES } from "@/config/executives";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Executive Team",
};

export default async function ExecutiveTeamPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Executive Team
        </p>

        <h1 className="text-4xl font-bold tracking-tight">Your leadership</h1>

        <p className="max-w-2xl text-muted-foreground">
          Each executive reads your KurvzOS data and advises on their area.
          Harper is live today.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {EXECUTIVES.map((executive) => {
          const card = (
            <div className="h-full space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-lg font-semibold tracking-tight">
                    {executive.name}
                  </p>

                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {executive.role}
                  </p>
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

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getYouTubeSetupState } from "@/lib/youtube/config";
import { CONTENT_TYPE_LABELS, type ContentStatusValue } from "@/lib/content";
import { formatInTimeZone } from "@/lib/timezone";
import { ContentStatusBadge } from "@/components/content/content-status-badge";
import { YouTubeConnectionCard } from "@/components/content/youtube-connection-card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Content",
};

const OAUTH_MESSAGES: Record<string, string> = {
  connected: "YouTube channel connected.",
  denied: "YouTube access was declined.",
  invalid: "That connection attempt expired. Please try again.",
  failed: "Could not finish connecting to YouTube.",
  no_refresh_token:
    "Google did not return a refresh token. Remove KurvzOS from your Google account permissions and connect again.",
};

interface ContentPageProps {
  searchParams: Promise<{ youtube?: string }>;
}

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const { youtube } = await searchParams;
  const setupState = getYouTubeSetupState();

  const [items, connection] = await Promise.all([
    prisma.contentItem.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      include: {
        task: { select: { title: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.youTubeConnection.findUnique({
      where: { profileId: profile.id },
      select: { channelTitle: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Content Studio
          </p>

          <h1 className="text-4xl font-bold tracking-tight">Content</h1>

          <p className="text-muted-foreground">
            Plan, upload and schedule YouTube videos from KurvzOS.
          </p>
        </div>

        <Button render={<Link href="/content/new" />}>New content</Button>
      </header>

      {youtube && OAUTH_MESSAGES[youtube] ? (
        <p role="status" className="rounded-2xl border p-4 text-sm">
          {OAUTH_MESSAGES[youtube]}
        </p>
      ) : null}

      <YouTubeConnectionCard
        configured={setupState.configured}
        missingEnv={setupState.missing}
        channelTitle={connection?.channelTitle ?? null}
      />

      <Separator />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No content yet. Create one from scratch or from an existing task.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/content/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-base font-medium">{item.title}</p>

                  <p className="truncate text-xs text-muted-foreground">
                    {CONTENT_TYPE_LABELS[item.contentType]}
                    {item.project ? ` · ${item.project.name}` : ""}
                    {item.task ? ` · ${item.task.title}` : ""}
                  </p>

                  {item.scheduledAt ? (
                    <p className="text-xs text-muted-foreground">
                      Scheduled {formatInTimeZone(item.scheduledAt, item.timezone)}
                    </p>
                  ) : null}
                </div>

                <ContentStatusBadge
                  status={item.status as ContentStatusValue}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOAuthSetupDetails,
  getYouTubeSetupState,
} from "@/lib/youtube/config";
import { TestUploadChecklist } from "@/components/content/test-upload-checklist";
import { CONTENT_TYPE_LABELS, type ContentStatusValue } from "@/lib/content";
import { formatInTimeZone } from "@/lib/timezone";
import { ContentStatusBadge } from "@/components/content/content-status-badge";
import { YouTubeConnectionCard } from "@/components/content/youtube-connection-card";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SectionLabel } from "@/components/ui/section-label";

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

/**
 * Which step of the handshake failed, in plain language. The stage name itself
 * carries no sensitive information — it is a fixed enum from our own callback.
 */
const OAUTH_STAGE_HINTS: Record<string, string> = {
  state_validation:
    "The security check on the returning request did not match. Start the connection again from this page.",
  token_exchange:
    "Google rejected the token exchange. Check that the client ID, client secret and redirect URI match the Google Cloud client exactly.",
  missing_refresh_token:
    "Google withheld a refresh token because this app was already authorised. Remove KurvzOS at myaccount.google.com/permissions, then connect again.",
  channel_lookup:
    "The token worked but the channel could not be read. Confirm YouTube Data API v3 is enabled and the account has a YouTube channel.",
  token_encryption:
    "The refresh token could not be encrypted. Check YOUTUBE_TOKEN_ENCRYPTION_KEY is a 32-byte base64 value.",
  database_save:
    "The connection could not be saved. Check the database is reachable and migrations have run.",
  unexpected: "An unexpected error occurred during the connection.",
};

/**
 * Channel-lookup outcomes, in plain language. Keys come from our own closed
 * set — Google's raw text never reaches this map.
 */
const CHANNEL_LOOKUP_HINTS: Record<string, string> = {
  no_channel_returned:
    "The token worked and the API answered, but no channel came back for this identity. This usually means the channel is a Brand Account: sign out, start the connection again, and pick the channel itself rather than the personal Google account on the “Choose an account” screen.",
  youtubeSignupRequired:
    "This Google account has not created a YouTube channel. Create one at youtube.com, then connect again.",
  insufficientPermissions:
    "The granted scopes do not allow reading the channel. Remove KurvzOS at myaccount.google.com/permissions and reconnect, accepting all requested permissions.",
  accessNotConfigured:
    "YouTube Data API v3 is not enabled on the Google Cloud project this client belongs to. Confirm the client ID in use belongs to the project where the API is enabled.",
  quotaExceeded:
    "The project's YouTube API quota is exhausted. Wait for the daily reset or request more quota.",
  authError:
    "Google rejected the access token when reading the channel. Reconnect the channel.",
  http_error:
    "The channel request did not complete. Check network access to googleapis.com, then try again.",
  unexpected: "Google returned an unrecognised response for the channel lookup.",
};

interface ContentPageProps {
  searchParams: Promise<{ youtube?: string; stage?: string; reason?: string }>;
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

  const { youtube, stage, reason } = await searchParams;
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
    <div className="mx-auto w-full max-w-standard space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <SectionLabel>
            Content Studio
          </SectionLabel>

          <h1 className="font-serif text-display-lg">Content</h1>

          <p className="text-muted-foreground">
            Plan, upload and schedule YouTube videos from KurvzOS.
          </p>
        </div>

        {/* Internal navigation — a styled Next Link, not a Button. */}
        <Link href="/content/new" className={buttonVariants()}>
          New content
        </Link>
      </header>

      {youtube && OAUTH_MESSAGES[youtube] ? (
        <div role="status" className="space-y-2 rounded-2xl border p-4 text-sm">
          <p>{OAUTH_MESSAGES[youtube]}</p>

          {stage && OAUTH_STAGE_HINTS[stage] ? (
            <>
              {/* The channel-lookup reason is more specific than the stage
                  hint, so it replaces it when present. */}
              <p className="text-muted-foreground">
                {(reason && CHANNEL_LOOKUP_HINTS[reason]) ??
                  OAUTH_STAGE_HINTS[stage]}
              </p>

              <p className="font-mono text-xs text-muted-foreground">
                stage: {stage}
                {reason ? ` · reason: ${reason}` : ""}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <YouTubeConnectionCard
        configured={setupState.configured}
        missingEnv={setupState.missing}
        channelTitle={connection?.channelTitle ?? null}
        oauthSetup={getOAuthSetupDetails()}
      />

      {process.env.NODE_ENV !== "production" ? <TestUploadChecklist /> : null}

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
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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

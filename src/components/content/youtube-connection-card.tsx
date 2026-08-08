"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, LinkIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";

interface YouTubeConnectionCardProps {
  configured: boolean;
  missingEnv: string[];
  channelTitle: string | null;
  /** Exact values to paste into Google Cloud. Never contains a secret. */
  oauthSetup: {
    origin: string;
    redirectUri: string;
    isFallback: boolean;
  };
}

function CopyableValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <SectionLabel>
        {label}
      </SectionLabel>

      <p className="break-all rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
        {value}
      </p>
    </div>
  );
}

export function YouTubeConnectionCard({
  configured,
  missingEnv,
  channelTitle,
  oauthSetup,
}: YouTubeConnectionCardProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);

  async function disconnect() {
    setIsWorking(true);

    try {
      const response = await fetch("/api/youtube/disconnect", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Could not disconnect");

      toast.success("YouTube channel disconnected");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not disconnect"
      );
    } finally {
      setIsWorking(false);
    }
  }

  // Missing credentials must show a setup state, never a crash.
  if (!configured) {
    return (
      <section
        aria-labelledby="youtube-setup-heading"
        className="space-y-3 rounded-2xl border border-dashed p-5"
      >
        <SectionLabel as="h2" id={"youtube-setup-heading"}>
          YouTube setup required
        </SectionLabel>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Add these environment variables, then restart the server:
          </p>

          <ul className="space-y-1 font-mono text-xs">
            {missingEnv.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>

        {/* Values only — a secret is never rendered here. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyableValue
            label="Authorised JavaScript origin"
            value={oauthSetup.origin}
          />

          <CopyableValue
            label="Authorised redirect URI"
            value={oauthSetup.redirectUri}
          />
        </div>

        {oauthSetup.isFallback ? (
          <p className="text-xs text-muted-foreground">
            NEXT_PUBLIC_APP_URL is not set, so these show the local development
            defaults. They must match your Google Cloud client exactly.
          </p>
        ) : null}

        <div className="space-y-2 rounded-2xl border p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">In Google Cloud:</p>

          <ol className="list-decimal space-y-1 pl-5">
            <li>Enable the YouTube Data API v3 for the project.</li>
            <li>
              Create an OAuth client of type Web application and paste the two
              values above.
            </li>
            <li>
              While the OAuth consent screen is in Testing mode, add the Google
              account that owns the channel as a test user — otherwise consent
              will be refused.
            </li>
          </ol>
        </div>
      </section>
    );
  }

  if (channelTitle) {
    return (
      <section
        aria-labelledby="youtube-connected-heading"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5"
      >
        <div className="space-y-1">
          <SectionLabel as="h2" id={"youtube-connected-heading"}>
            YouTube channel
          </SectionLabel>

          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckIcon className="size-4" aria-hidden="true" />
            {channelTitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Re-running consent replaces the stored refresh token, which is the
              recovery path when authorization expires.

              A plain anchor styled with buttonVariants: this navigates to a
              server route that redirects to Google, so it is a link, not a
              button. Routing it through the Base UI Button would make the
              component claim button semantics for an anchor. */}
          <a
            href="/api/youtube/connect"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Reconnect
          </a>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={disconnect}
            disabled={isWorking}
          >
            Disconnect
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="youtube-connect-heading"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5"
    >
      <div className="space-y-1">
        <SectionLabel as="h2" id={"youtube-connect-heading"}>
          YouTube channel
        </SectionLabel>

        <p className="text-sm text-muted-foreground">
          Connect a channel to upload and schedule videos.
        </p>
      </div>

      {/* A plain link: the server route redirects to Google consent. */}
      <a
        href="/api/youtube/connect"
        className={buttonVariants({ variant: "default" })}
      >
        <LinkIcon />
        Connect YouTube
      </a>
    </section>
  );
}

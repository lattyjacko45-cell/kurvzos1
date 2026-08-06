"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface YouTubeConnectionCardProps {
  configured: boolean;
  missingEnv: string[];
  channelTitle: string | null;
}

export function YouTubeConnectionCard({
  configured,
  missingEnv,
  channelTitle,
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
        <h2
          id="youtube-setup-heading"
          className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
        >
          YouTube setup required
        </h2>

        <p className="text-sm text-muted-foreground">
          Add these environment variables, then restart the server to enable
          publishing:
        </p>

        <ul className="space-y-1 font-mono text-xs">
          {missingEnv.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
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
          <h2
            id="youtube-connected-heading"
            className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
          >
            YouTube channel
          </h2>

          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckIcon className="size-4" aria-hidden="true" />
            {channelTitle}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={disconnect}
          disabled={isWorking}
        >
          Disconnect
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="youtube-connect-heading"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5"
    >
      <div className="space-y-1">
        <h2
          id="youtube-connect-heading"
          className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground"
        >
          YouTube channel
        </h2>

        <p className="text-sm text-muted-foreground">
          Connect a channel to upload and schedule videos.
        </p>
      </div>

      {/* A plain link: the server route redirects to Google. */}
      <Button type="button" render={<a href="/api/youtube/connect" />}>
        <LinkIcon />
        Connect YouTube
      </Button>
    </section>
  );
}

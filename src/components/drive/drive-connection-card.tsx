"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, FolderIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import type { DriveReadState } from "@/lib/drive/normalize";

interface DriveConnectionCardProps {
  configured: boolean;
  missingEnv: string[];
  state: DriveReadState;
  accountEmail: string | null;
  /** Exact values to paste into Google Cloud. Never contains a secret. */
  oauthSetup: { origin: string; redirectUri: string; isFallback: boolean };
}

function SetupValue({ label, value }: { label: string; value: string }) {
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

export function DriveConnectionCard({
  configured,
  missingEnv,
  state,
  accountEmail,
  oauthSetup,
}: DriveConnectionCardProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);

  async function disconnect() {
    setIsWorking(true);

    try {
      const response = await fetch("/api/drive/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect");

      toast.success("Google Drive disconnected from KurvzOS");
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
      <section className="space-y-4 rounded-2xl border border-dashed p-5">
        <SectionLabel as="h2">
          Google Drive setup required
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
          <SetupValue
            label="Authorised JavaScript origin"
            value={oauthSetup.origin}
          />
          <SetupValue
            label="Authorised redirect URI"
            value={oauthSetup.redirectUri}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Enable the Google Drive API in the same Cloud project, and add the
          redirect URI above to the existing OAuth client.
        </p>
      </section>
    );
  }

  if (
    state === "connected" ||
    state === "reconnect_required" ||
    state === "error"
  ) {
    const needsReconnect = state === "reconnect_required";

    return (
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
        <div className="min-w-0 space-y-2">
          <SectionLabel as="h2">
            Google Drive
          </SectionLabel>

          {needsReconnect ? (
            /* Covers both an expired credential and a grant that predates the
               Drive scope — Google answers the latter with 403, and the fix is
               the same consent screen either way. */
            <p className="text-sm text-destructive">
              Drive access is unavailable — reconnect to grant read-only file
              access.
            </p>
          ) : state === "error" ? (
            <p className="text-sm text-muted-foreground">
              Drive is temporarily unavailable. Your connection is still in
              place.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckIcon className="size-4" aria-hidden="true" />
              {accountEmail ?? "Connected account"}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Read-only metadata. KurvzOS can see file names, types and dates —
            it cannot open, download, edit, move or delete anything.
          </p>

          <p className="text-xs text-muted-foreground">
            Disconnecting stops KurvzOS reading your Drive. It does not revoke
            access at Google — that would also disconnect YouTube, Calendar and
            Gmail. You can remove KurvzOS entirely at
            myaccount.google.com/permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* A plain link: the server route redirects to Google consent. */}
          <a
            href="/api/drive/connect"
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
    <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
      <div className="min-w-0 space-y-2">
        <SectionLabel as="h2">
          Google Drive
        </SectionLabel>

        <p className="text-sm text-muted-foreground">
          Connect to see recent files from your Drive in KurvzOS. Read-only
          metadata — file contents are never opened or downloaded.
        </p>
      </div>

      <a
        href="/api/drive/connect"
        className={buttonVariants({ variant: "default" })}
      >
        <FolderIcon />
        Connect Google Drive
      </a>
    </section>
  );
}

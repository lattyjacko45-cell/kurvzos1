"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, MailIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import type { GmailReadState } from "@/lib/gmail/normalize";

interface GmailConnectionCardProps {
  configured: boolean;
  missingEnv: string[];
  state: GmailReadState;
  emailAddress: string | null;
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

export function GmailConnectionCard({
  configured,
  missingEnv,
  state,
  emailAddress,
  oauthSetup,
}: GmailConnectionCardProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);

  async function disconnect() {
    setIsWorking(true);

    try {
      const response = await fetch("/api/gmail/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Could not disconnect");

      toast.success("Gmail disconnected from KurvzOS");
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
          Gmail setup required
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
          Enable the Gmail API in the same Cloud project, and add the redirect
          URI above to the existing OAuth client.
        </p>
      </section>
    );
  }

  if (state === "connected" || state === "reconnect_required" || state === "error") {
    const needsReconnect = state === "reconnect_required";

    return (
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
        <div className="min-w-0 space-y-2">
          <SectionLabel as="h2">
            Gmail
          </SectionLabel>

          {needsReconnect ? (
            /* Covers both an expired credential and a grant that predates the
               Gmail scope — Google answers the latter with 403, and the fix is
               the same consent screen either way. */
            <p className="text-sm text-destructive">
              Gmail access is unavailable — reconnect to grant read-only inbox
              permission.
            </p>
          ) : state === "error" ? (
            <p className="text-sm text-muted-foreground">
              Gmail is temporarily unavailable. Your connection is still in
              place.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckIcon className="size-4" aria-hidden="true" />
              {emailAddress ?? "Connected mailbox"}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Read-only. KurvzOS cannot send, reply to, delete or archive mail.
          </p>

          <p className="text-xs text-muted-foreground">
            Disconnecting stops KurvzOS reading your mail. It does not revoke
            access at Google — that would also disconnect YouTube and Calendar.
            You can remove KurvzOS entirely at myaccount.google.com/permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* A plain link: the server route redirects to Google consent. */}
          <a
            href="/api/gmail/connect"
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
          Gmail
        </SectionLabel>

        <p className="text-sm text-muted-foreground">
          Connect to see recent inbox mail in KurvzOS. Read-only — mail is never
          sent, replied to, deleted or archived.
        </p>
      </div>

      <a
        href="/api/gmail/connect"
        className={buttonVariants({ variant: "default" })}
      >
        <MailIcon />
        Connect Gmail
      </a>
    </section>
  );
}

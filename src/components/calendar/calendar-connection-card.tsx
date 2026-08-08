"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, CheckIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";

export type CalendarConnectionState =
  | "not_connected"
  | "connected"
  | "reconnect_required"
  | "error";

interface CalendarConnectionCardProps {
  configured: boolean;
  missingEnv: string[];
  state: CalendarConnectionState;
  calendarLabel: string | null;
  timeZone: string | null;
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

export function CalendarConnectionCard({
  configured,
  missingEnv,
  state,
  calendarLabel,
  timeZone,
  oauthSetup,
}: CalendarConnectionCardProps) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);

  async function disconnect() {
    setIsWorking(true);

    try {
      const response = await fetch("/api/calendar/disconnect", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Could not disconnect");

      toast.success("Calendar disconnected from KurvzOS");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not disconnect"
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (!configured) {
    return (
      <section className="space-y-4 rounded-2xl border border-dashed p-5">
        <SectionLabel as="h3">
          Google Calendar setup required
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
          Enable the Google Calendar API in the same Cloud project, and add the
          redirect URI above to the existing OAuth client.
        </p>
      </section>
    );
  }

  if (state === "connected" || state === "reconnect_required") {
    const needsReconnect = state === "reconnect_required";

    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5">
        <div className="space-y-1">
          <SectionLabel as="h3">
            Google Calendar
          </SectionLabel>

          {needsReconnect ? (
            <p className="text-sm text-destructive">
              Authorization expired — reconnect to resume reading your schedule.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckIcon className="size-4" aria-hidden="true" />
              {calendarLabel ?? "Primary calendar"}
              {timeZone ? (
                <span className="text-muted-foreground">· {timeZone}</span>
              ) : null}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Read-only. KurvzOS cannot create, edit or delete events.
          </p>

          <p className="text-xs text-muted-foreground">
            Disconnecting stops KurvzOS reading your calendar. It does not
            revoke access at Google — that would also disconnect YouTube. You
            can remove KurvzOS entirely at myaccount.google.com/permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/calendar/connect"
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
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5">
      <div className="space-y-1">
        <SectionLabel as="h3">
          Google Calendar
        </SectionLabel>

        <p className="text-sm text-muted-foreground">
          Connect to show your schedule in KurvzOS. Read-only — events are never
          created, edited or deleted.
        </p>
      </div>

      <a
        href="/api/calendar/connect"
        className={buttonVariants({ variant: "default" })}
      >
        <CalendarIcon />
        Connect Google Calendar
      </a>
    </section>
  );
}

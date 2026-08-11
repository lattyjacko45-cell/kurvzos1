import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import {
  getGmailOAuthSetupDetails,
  getGmailSetupState,
} from "@/lib/gmail/config";
import { getInboxForProfile } from "@/lib/gmail/read.server";
import {
  GMAIL_FAILURE_HINTS,
  isGmailFailureReason,
} from "@/lib/gmail/failure";
import { GmailConnectionCard } from "@/components/inbox/gmail-connection-card";
import { InboxMessageList } from "@/components/inbox/inbox-message-list";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Inbox",
};

/** Outcomes of the OAuth round trip, in plain language. */
const GMAIL_MESSAGES: Record<string, string> = {
  connected: "Gmail connected.",
  denied: "Gmail access was declined.",
  invalid: "That connection attempt expired. Please try again.",
  failed: "Could not finish connecting Gmail.",
  no_refresh_token:
    "Google did not return a refresh token. Remove KurvzOS at myaccount.google.com/permissions, then connect again.",
};

interface InboxPageProps {
  searchParams: Promise<{ gmail?: string; stage?: string; reason?: string }>;
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const { gmail, stage, reason } = await searchParams;
  const oauthMessage = gmail ? GMAIL_MESSAGES[gmail] : undefined;
  // Only a value from the closed set can index the hint map.
  const oauthHint = isGmailFailureReason(reason)
    ? GMAIL_FAILURE_HINTS[reason]
    : undefined;
  const setupState = getGmailSetupState();

  // Never throws: a missing credential or an unavailable Gmail resolves to a
  // state, so this page cannot crash because Gmail is down.
  const inbox = setupState.configured
    ? await getInboxForProfile(profile.id)
    : { state: "not_connected" as const, messages: [], emailAddress: null };

  return (
    <div className="mx-auto w-full max-w-focused space-y-8">
      <PageHeader
        eyebrow="Connected Workspace"
        title="Inbox"
        description="Recent mail from your connected Gmail account, read-only."
      />

      {oauthMessage ? (
        <div role="status" className="space-y-2 rounded-2xl border p-4 text-sm">
          <p>{oauthMessage}</p>

          {/* What to actually do about it, when Google told us enough to say.
              Same treatment as the Content page's channel-lookup hints. */}
          {oauthHint ? (
            <p className="text-muted-foreground">{oauthHint}</p>
          ) : null}

          {stage ? (
            <p className="font-mono text-xs text-muted-foreground">
              stage: {stage}
              {reason ? ` · reason: ${reason}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <GmailConnectionCard
        configured={setupState.configured}
        missingEnv={setupState.missing}
        state={inbox.state}
        emailAddress={inbox.emailAddress}
        oauthSetup={getGmailOAuthSetupDetails()}
      />

      {/*
        Four distinct states, each told truthfully rather than collapsed into
        one empty list: not connected, credential unusable, temporary failure,
        and genuinely empty.
      */}
      <section aria-label="Recent messages">
        {!setupState.configured ? null : inbox.state === "not_connected" ? (
          <p className="text-sm text-muted-foreground">
            Connect Gmail above to see your recent mail here.
          </p>
        ) : inbox.state === "reconnect_required" && inbox.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            KurvzOS cannot read this mailbox right now. Reconnect above to grant
            read-only inbox permission.
          </p>
        ) : inbox.state === "error" && inbox.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Gmail did not respond. This is usually temporary — reload in a
            moment.
          </p>
        ) : inbox.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent messages in this inbox.
          </p>
        ) : (
          <InboxMessageList messages={inbox.messages} />
        )}
      </section>
    </div>
  );
}

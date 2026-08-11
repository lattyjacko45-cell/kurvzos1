import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import {
  getDriveOAuthSetupDetails,
  getDriveSetupState,
} from "@/lib/drive/config";
import { getDriveFilesForProfile } from "@/lib/drive/read.server";
import {
  DRIVE_FAILURE_HINTS,
  isDriveFailureReason,
} from "@/lib/drive/failure";
import { MAX_SEARCH_LENGTH } from "@/lib/drive/normalize";
import { DriveConnectionCard } from "@/components/drive/drive-connection-card";
import { DriveFileList } from "@/components/drive/drive-file-list";
import { DriveSearchForm } from "@/components/drive/drive-search-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Drive",
};

/** Outcomes of the OAuth round trip, in plain language. */
const DRIVE_MESSAGES: Record<string, string> = {
  connected: "Google Drive connected.",
  denied: "Drive access was declined.",
  invalid: "That connection attempt expired. Please try again.",
  failed: "Could not finish connecting Google Drive.",
  no_refresh_token:
    "Google did not return a refresh token. Remove KurvzOS at myaccount.google.com/permissions, then connect again.",
};

interface DrivePageProps {
  searchParams: Promise<{
    drive?: string;
    stage?: string;
    reason?: string;
    q?: string;
  }>;
}

export default async function DrivePage({ searchParams }: DrivePageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const { drive, stage, reason, q } = await searchParams;
  const oauthMessage = drive ? DRIVE_MESSAGES[drive] : undefined;
  // Only a value from the closed set can index the hint map.
  const oauthHint = isDriveFailureReason(reason)
    ? DRIVE_FAILURE_HINTS[reason]
    : undefined;

  const search = (q ?? "").slice(0, MAX_SEARCH_LENGTH);
  const setupState = getDriveSetupState();

  // Never throws: a missing credential or an unavailable Drive resolves to a
  // state, so this page cannot crash because Drive is down.
  const drivefiles = setupState.configured
    ? await getDriveFilesForProfile(profile.id, { search })
    : {
        state: "not_connected" as const,
        files: [],
        accountEmail: null,
        incompleteSearch: false,
      };

  const isConnected = drivefiles.state !== "not_connected";

  return (
    <div className="mx-auto w-full max-w-focused space-y-8">
      <PageHeader
        eyebrow="Connected Workspace"
        title="Drive"
        description="Recent files from your connected Google Drive, read-only."
      />

      {oauthMessage ? (
        <div role="status" className="space-y-2 rounded-2xl border p-4 text-sm">
          <p>{oauthMessage}</p>

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

      <DriveConnectionCard
        configured={setupState.configured}
        missingEnv={setupState.missing}
        state={drivefiles.state}
        accountEmail={drivefiles.accountEmail}
        oauthSetup={getDriveOAuthSetupDetails()}
      />

      {/* Search only appears once there is something to search. */}
      {setupState.configured && isConnected ? (
        <DriveSearchForm value={search} />
      ) : null}

      {/*
        Five distinct states, each told truthfully rather than collapsed into
        one empty list: not connected, credential unusable, temporary failure,
        no search matches, and a genuinely empty Drive.
      */}
      <section aria-label="Drive files" className="space-y-3">
        {!setupState.configured ? null : drivefiles.state ===
          "not_connected" ? (
          <p className="text-sm text-muted-foreground">
            Connect Google Drive above to see your recent files here.
          </p>
        ) : drivefiles.state === "reconnect_required" &&
          drivefiles.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            KurvzOS cannot read this Drive right now. Reconnect above to grant
            read-only file access.
          </p>
        ) : drivefiles.state === "error" && drivefiles.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Drive did not respond. This is usually temporary — reload in a
            moment.
          </p>
        ) : drivefiles.files.length === 0 && search ? (
          <p className="text-sm text-muted-foreground">
            No files match that name.
          </p>
        ) : drivefiles.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent files in this Drive.
          </p>
        ) : (
          <>
            <DriveFileList files={drivefiles.files} />

            {drivefiles.incompleteSearch ? (
              <p className="text-xs text-muted-foreground">
                Google could not search every location, so this list may be
                incomplete. Narrowing the search usually helps.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

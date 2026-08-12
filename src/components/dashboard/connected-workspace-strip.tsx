import { Separator } from "@/components/ui/separator";
import { SectionLabel } from "@/components/ui/section-label";
import {
  buildWorkspaceSummary,
  hasSummaryContent,
} from "@/lib/workspace-context/types";
import { getConnectedWorkspaceContext } from "@/lib/workspace-context/context.server";

interface ConnectedWorkspaceStripProps {
  profileId: string;
  workspaceId: string;
}

/**
 * One line of Connected Workspace awareness inside the Daily Briefing card.
 *
 * Its own async component so the caller can wrap it in Suspense: the mission
 * card paints from task data alone, and the Gmail and Drive reads stream in
 * behind it rather than blocking the page's primary decision.
 *
 * Renders nothing when every source is disconnected or quiet. That is
 * deliberate — an empty "Connected Workspace" heading would be four integration
 * widgets' worth of chrome for no information.
 */
export async function ConnectedWorkspaceStrip({
  profileId,
  workspaceId,
}: ConnectedWorkspaceStripProps) {
  // Request-cached: Harper's context build shares this same aggregation.
  const context = await getConnectedWorkspaceContext(profileId, workspaceId);
  const summary = buildWorkspaceSummary(context);

  if (!hasSummaryContent(summary)) return null;

  return (
    <>
      <Separator className="my-5" />

      <div className="space-y-1">
        <SectionLabel>
          Connected Workspace
        </SectionLabel>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {summary.nextEvent ? <span>Next: {summary.nextEvent}</span> : null}

          {summary.unreadMessages !== null ? (
            <span className="tabular-nums">
              {summary.unreadMessages} unread
            </span>
          ) : null}

          {summary.recentDriveFiles !== null ? (
            <span className="tabular-nums">
              {summary.recentDriveFiles} recent files
            </span>
          ) : null}

          {summary.contentNeedingAttention !== null ? (
            <span className="tabular-nums">
              {summary.contentNeedingAttention} content needs attention
            </span>
          ) : null}
        </div>

        {/* Surfaced because it is actionable: the user has to reconnect before
            that source works again. */}
        {summary.needsReconnect.length > 0 ? (
          <p className="text-sm text-destructive">
            Reconnect required: {summary.needsReconnect.join(", ")}
          </p>
        ) : null}
      </div>
    </>
  );
}

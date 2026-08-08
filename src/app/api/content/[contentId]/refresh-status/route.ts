import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import {
  YouTubeApiError,
  fetchVideoStatus,
  getAccessTokenForProfile,
} from "@/lib/youtube/client";
import { YouTubeNotConfiguredError } from "@/lib/youtube/config";
import {
  mapYouTubeStatus,
  type MappedContentStatus,
} from "@/lib/youtube/status-map";
import type { ContentStatus } from "@/generated/prisma/client";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

/**
 * Compile-time guard: every status the mapping can produce must exist in the
 * Prisma enum. If someone edits either side, this line fails `tsc` rather than
 * throwing at runtime on a live refresh.
 */
const _statusesExistInPrisma: Record<MappedContentStatus, ContentStatus> = {
  PROCESSING: "PROCESSING",
  UPLOADED: "UPLOADED",
  SCHEDULED: "SCHEDULED",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
};
void _statusesExistInPrisma;

/**
 * POST /api/content/[contentId]/refresh-status
 *
 * Reads the live YouTube state and maps it onto our status vocabulary.
 *
 * This route is READ-ONLY with respect to YouTube. It calls `videos.list` and
 * nothing else — no upload session is opened, no video resource is created.
 * Refreshing cannot produce a second video no matter how many times it runs.
 */
export async function POST(_request: Request, context: RouteContext) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await context.params;
  const item = await findOwnedContent(contentId, profileId);

  if (!item) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (!item.youtubeVideoId) {
    return NextResponse.json(
      { error: "This content has not been uploaded yet." },
      { status: 409 }
    );
  }

  try {
    const accessToken = await getAccessTokenForProfile(profileId);
    const facts = await fetchVideoStatus(accessToken, item.youtubeVideoId);

    if (!facts) {
      return NextResponse.json(
        { error: "YouTube no longer returns this video." },
        { status: 404 }
      );
    }

    const mapped = mapYouTubeStatus(facts, new Date());

    /**
     * Safe diagnostics.
     *
     * Contains only our own record id, the YouTube video id (a public
     * identifier, already stored and rendered in the watch URL), YouTube's
     * fixed enum values, the publish instant, and the mapped result. It carries
     * no access token, no refresh token, no client secret, no channel id and no
     * user-authored text.
     */
    console.error("[youtube] status sync", {
      contentId,
      youtubeVideoId: item.youtubeVideoId,
      uploadStatus: facts.uploadStatus,
      processingStatus: facts.processingStatus,
      privacyStatus: facts.privacyStatus,
      publishAt: facts.publishAt,
      failureReason: facts.failureReason,
      rejectionReason: facts.rejectionReason,
      processingFailureReason: facts.processingFailureReason,
      previousStatus: item.status,
      mappedStatus: mapped.status,
      mappingReason: mapped.reason,
    });

    const updated = await prisma.contentItem.update({
      where: { id: contentId },
      data: {
        status: mapped.status,
        // Keep the raw signal for support: processingDetails when YouTube gave
        // us one, otherwise the uploadStatus we actually decided on.
        processingStatus: facts.processingStatus ?? facts.uploadStatus,
        // Only ever set publishedAt going forward — never clear a real one.
        publishedAt:
          mapped.status === "PUBLISHED"
            ? (item.publishedAt ?? new Date())
            : item.publishedAt,
        errorMessage: mapped.errorMessage,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof YouTubeNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Could not refresh the status." },
      { status: 500 }
    );
  }
}

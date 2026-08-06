import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import {
  YouTubeApiError,
  fetchVideoStatus,
  getAccessTokenForProfile,
} from "@/lib/youtube/client";
import { YouTubeNotConfiguredError } from "@/lib/youtube/config";
import type { ContentStatus } from "@/generated/prisma/client";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

/**
 * POST /api/content/[contentId]/refresh-status
 *
 * Reads the live YouTube state and maps it onto our status vocabulary.
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
    const status = await fetchVideoStatus(accessToken, item.youtubeVideoId);

    if (!status) {
      return NextResponse.json(
        { error: "YouTube no longer returns this video." },
        { status: 404 }
      );
    }

    let nextStatus: ContentStatus = item.status;
    let publishedAt = item.publishedAt;
    let errorMessage: string | null = null;

    if (status.uploadStatus === "failed" || status.uploadStatus === "rejected") {
      nextStatus = "FAILED";
      errorMessage = status.failureReason ?? "YouTube rejected the video.";
    } else if (status.processingStatus === "processing") {
      nextStatus = "PROCESSING";
    } else if (status.privacyStatus === "public") {
      nextStatus = "PUBLISHED";
      publishedAt = publishedAt ?? new Date();
    } else if (status.publishAt) {
      nextStatus = "SCHEDULED";
    } else if (status.uploadStatus === "processed") {
      // Processed, private, no publishAt: uploaded but never scheduled.
      nextStatus = item.scheduledAt ? "SCHEDULED" : "PROCESSING";
    }

    const updated = await prisma.contentItem.update({
      where: { id: contentId },
      data: {
        status: nextStatus,
        processingStatus: status.processingStatus ?? status.uploadStatus,
        publishedAt,
        errorMessage,
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

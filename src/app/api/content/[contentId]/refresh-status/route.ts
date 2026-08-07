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

    const hasPublishAt = Boolean(status.publishAt);

    // Safe diagnostics: the four fields the mapping actually reads. No video
    // id, no publishAt value, no channel id, no title, no URL, no tokens.
    console.error("[youtube] video status", {
      processingStatus: status.processingStatus,
      uploadStatus: status.uploadStatus,
      privacyStatus: status.privacyStatus,
      hasPublishAt,
    });

    let nextStatus: ContentStatus = item.status;
    let publishedAt = item.publishedAt;
    let errorMessage: string | null = null;

    // Rules are evaluated in this order deliberately: failure first, then
    // in-flight, then the three terminal states.
    //
    // The previous version had no branch for uploadStatus "uploaded", so a
    // finished private video matched nothing and silently kept its old value —
    // which is why items sat on PROCESSING forever.
    if (
      status.processingStatus === "failed" ||
      status.uploadStatus === "failed" ||
      status.uploadStatus === "rejected"
    ) {
      // B — processing failed, or YouTube rejected the upload.
      nextStatus = "FAILED";
      errorMessage = status.failureReason ?? "YouTube rejected the video.";
    } else if (status.processingStatus === "processing") {
      // A — genuinely still being processed.
      nextStatus = "PROCESSING";
    } else if (hasPublishAt) {
      // C — a publish time exists, so YouTube accepted the schedule.
      nextStatus = "SCHEDULED";
    } else if (status.privacyStatus === "public") {
      // D — live on YouTube.
      nextStatus = "PUBLISHED";
      publishedAt = publishedAt ?? new Date();
    } else {
      // E — on YouTube, not processing, private, no publish time.
      // Truthfully complete. We do NOT claim Scheduled here even when the user
      // asked for a schedule: absent publishAt, YouTube did not accept one.
      nextStatus = "UPLOADED";

      if (item.scheduledAt) {
        errorMessage =
          "The video uploaded successfully but YouTube did not record a publish time. If the API project is unverified, uploads can be forced private until Google completes its audit. Set the publish time in YouTube Studio, or re-check after verification.";
      }
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

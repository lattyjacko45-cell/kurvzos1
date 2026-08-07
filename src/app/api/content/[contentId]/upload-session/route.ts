import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import {
  MAX_VIDEO_BYTES,
  isAllowedVideoType,
  hasErrors,
  validatePublishingDetails,
} from "@/lib/content";
import {
  YouTubeApiError,
  createResumableUploadSession,
  mintAccessTokenForProfile,
} from "@/lib/youtube/client";
import {
  YouTubeNotConfiguredError,
  requireYouTubeEnv,
} from "@/lib/youtube/config";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

const sessionSchema = z.object({
  fileSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  mimeType: z.string().trim().min(1).max(100),
});

/**
 * POST /api/content/[contentId]/upload-session
 *
 * Authenticates the profile, asks YouTube to open a resumable session, and
 * returns the session URL. The video bytes go straight from the browser to
 * Google — they never transit this server.
 */
export async function POST(request: Request, context: RouteContext) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await context.params;
  const item = await findOwnedContent(contentId, profileId);

  if (!item) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (item.youtubeVideoId) {
    return NextResponse.json(
      { error: "This content already has a YouTube video." },
      { status: 409 }
    );
  }

  try {
    const data = sessionSchema.parse(await request.json());

    if (!isAllowedVideoType(data.mimeType)) {
      return NextResponse.json(
        { error: "That file type is not a supported video format." },
        { status: 400 }
      );
    }

    // Re-validate the saved details: the row could have been edited since.
    // scheduledAt is passed as null here and checked separately — the 15-minute
    // lead rule applies when *choosing* a time, not when uploading against an
    // already-saved one.
    const fieldErrors = validatePublishingDetails({
      title: item.title,
      description: item.description,
      tags: item.tags,
      categoryId: item.categoryId,
      madeForKids: item.madeForKids,
      contentType: item.contentType,
      scheduledAt: null,
      timezone: item.timezone,
    });

    if (hasErrors(fieldErrors)) {
      return NextResponse.json(
        { error: "Publishing details are incomplete.", fieldErrors },
        { status: 400 }
      );
    }

    // YouTube rejects a publishAt in the past outright.
    if (item.scheduledAt && item.scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          error: "The scheduled time has passed. Pick a new time before uploading.",
          fieldErrors: { scheduledAt: "Choose a future date and time." },
        },
        { status: 400 }
      );
    }

    // Minted fresh for this upload. The refresh token stays server-side; only
    // this short-lived token is returned, because the YouTube resumable
    // protocol requires an Authorization header on the browser's PUT.
    const { accessToken, expiresIn } = await mintAccessTokenForProfile(
      profileId
    );

    // Forwarded as Origin on the initiation call. See the note in
    // createResumableUploadSession — defensive, not a verified requirement.
    const browserOrigin = requireYouTubeEnv().appUrl;

    const uploadUrl = await createResumableUploadSession(
      accessToken,
      {
        title: item.title,
        description: item.description,
        tags: item.tags,
        categoryId: item.categoryId,
        madeForKids: item.madeForKids,
        publishAt: item.scheduledAt ? item.scheduledAt.toISOString() : null,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      },
      browserOrigin
    );

    await prisma.contentItem.update({
      where: { id: contentId },
      data: { status: "UPLOADING", uploadProgress: 0, errorMessage: null },
    });

    // no-store: the body carries a bearer token, so it must never be cached
    // by the browser, a proxy, or the Next.js data cache.
    return NextResponse.json(
      { uploadUrl, accessToken, expiresIn },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }

    if (err instanceof YouTubeNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Could not start the upload." },
      { status: 500 }
    );
  }
}

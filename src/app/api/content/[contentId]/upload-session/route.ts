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

  /**
   * Duplicate-upload guards.
   *
   * Opening a session is the only call that can create a new video resource, so
   * this is the single place duplication has to be stopped.
   */
  if (item.youtubeVideoId) {
    return NextResponse.json(
      {
        error:
          "This content already has a YouTube video. Use Refresh status to read its current state, or create a new content item to upload a different video.",
      },
      { status: 409 }
    );
  }

  /**
   * These statuses are only ever reached after a video id was recorded, so
   * seeing one without an id means the id was cleared by hand. Opening a fresh
   * session here would upload a second copy of content that is already live.
   *
   * UPLOADING is deliberately NOT blocked: an upload interrupted by a closed
   * tab leaves the row stuck on UPLOADING with no video id, and blocking it
   * would make that record permanently un-uploadable with no way out.
   */
  const COMPLETED_UPLOAD_STATUSES = [
    "PROCESSING",
    "UPLOADED",
    "SCHEDULED",
    "PUBLISHED",
  ] as const;

  if (
    (COMPLETED_UPLOAD_STATUSES as readonly string[]).includes(item.status)
  ) {
    return NextResponse.json(
      {
        error:
          "This content has already been uploaded to YouTube. Create a new content item to upload a different video.",
      },
      { status: 409 }
    );
  }

  // Set only once this request owns the row, so the catch below can never
  // release a claim belonging to a different in-flight upload.
  let claimedByThisRequest = false;

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

    /**
     * Atomically claim the row before talking to YouTube.
     *
     * The checks above read the row and then act on it; two requests arriving
     * together can both pass them and both open a session, which is two videos.
     * This conditional update is the actual mutual exclusion: only one caller
     * can move the row out of a non-UPLOADING state, and the `youtubeVideoId:
     * null` predicate re-verifies the duplicate guard inside the same
     * statement the database serialises.
     */
    const claim = await prisma.contentItem.updateMany({
      where: {
        id: contentId,
        profileId,
        youtubeVideoId: null,
        status: { notIn: ["UPLOADING", ...COMPLETED_UPLOAD_STATUSES] },
      },
      data: { status: "UPLOADING", uploadProgress: 0, errorMessage: null },
    });

    claimedByThisRequest = claim.count === 1;

    if (!claimedByThisRequest) {
      return NextResponse.json(
        {
          error:
            "An upload for this content is already in progress. Wait for it to finish, then use Refresh status.",
        },
        { status: 409 }
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

    // The row was already moved to UPLOADING by the claim above, so there is no
    // second write here. Doing it after the session call was what left the
    // window open for a concurrent request in the first place.

    // no-store: the body carries a bearer token, so it must never be cached
    // by the browser, a proxy, or the Next.js data cache.
    return NextResponse.json(
      { uploadUrl, accessToken, expiresIn },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (err) {
    /**
     * Release the claim.
     *
     * Everything from the claim onward can throw before any video exists on
     * YouTube. Leaving the row on UPLOADING would strand it, so it goes back to
     * READY — but only while `youtubeVideoId` is still null, so this can never
     * walk back a row that did reach YouTube.
     */
    if (claimedByThisRequest) {
      await prisma.contentItem
        .updateMany({
          where: {
            id: contentId,
            profileId,
            youtubeVideoId: null,
            status: "UPLOADING",
          },
          data: { status: "READY", uploadProgress: 0 },
        })
        .catch(() => undefined);
    }

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

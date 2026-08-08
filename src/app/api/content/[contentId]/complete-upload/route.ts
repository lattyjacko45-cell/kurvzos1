import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import { youtubeWatchUrl } from "@/lib/content";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

const completeSchema = z.object({
  youtubeVideoId: z.string().trim().min(1).max(64).optional(),
  /** Progress ticks during the upload; final call omits it. */
  uploadProgress: z.number().int().min(0).max(100).optional(),
  failed: z.boolean().optional(),
  errorMessage: z.string().max(500).optional(),
});

/**
 * POST /api/content/[contentId]/complete-upload
 *
 * Called by the browser to record progress, the resulting video id, or a
 * failure. Kept separate from the session route so a failed upload can be
 * retried without re-opening a session by accident.
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

  try {
    const data = completeSchema.parse(await request.json());

    if (data.failed) {
      /**
       * A recorded video id outranks a reported failure.
       *
       * The browser reports failure for anything thrown after the PUT — a
       * failed thumbnail, a dropped `complete-upload` response. Stamping FAILED
       * over a record that already holds a video id would both lie about a
       * video that exists on YouTube and re-enable the retry button, which is
       * exactly how a second upload of the same content gets created.
       */
      if (item.youtubeVideoId) {
        const preserved = await prisma.contentItem.update({
          where: { id: contentId },
          data: {
            errorMessage:
              "The video reached YouTube, but a later step did not finish. Use Refresh status to read its current state.",
          },
        });

        return NextResponse.json(preserved);
      }

      const updated = await prisma.contentItem.update({
        where: { id: contentId },
        data: {
          status: "FAILED",
          errorMessage: data.errorMessage ?? "The upload did not complete.",
        },
      });

      return NextResponse.json(updated);
    }

    if (data.youtubeVideoId) {
      /**
       * First id wins, permanently.
       *
       * If a record already points at a video, a second id means a duplicate
       * was created on YouTube. Overwriting would orphan the original — we
       * would lose the only reference to it. Reject instead, and keep pointing
       * at the upload we already know about.
       */
      if (item.youtubeVideoId && item.youtubeVideoId !== data.youtubeVideoId) {
        console.error("[content] duplicate video id rejected", {
          contentId,
          existingVideoId: item.youtubeVideoId,
          rejectedVideoId: data.youtubeVideoId,
        });

        return NextResponse.json(
          {
            error:
              "This content already points at a YouTube video. The newly uploaded video was not recorded — remove it in YouTube Studio if it is a duplicate.",
          },
          { status: 409 }
        );
      }

      const updated = await prisma.contentItem.update({
        where: { id: contentId },
        data: {
          youtubeVideoId: data.youtubeVideoId,
          youtubeUrl: youtubeWatchUrl(data.youtubeVideoId),
          uploadProgress: 100,
          // Scheduled videos sit private until publishAt; either way YouTube
          // still has to process the file first.
          status: "PROCESSING",
          errorMessage: null,
        },
      });

      return NextResponse.json(updated);
    }

    if (typeof data.uploadProgress === "number") {
      const updated = await prisma.contentItem.update({
        where: { id: contentId },
        data: { uploadProgress: data.uploadProgress },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Nothing to record." }, { status: 400 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not record the upload result." },
      { status: 500 }
    );
  }
}

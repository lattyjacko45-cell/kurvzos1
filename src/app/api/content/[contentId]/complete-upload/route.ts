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

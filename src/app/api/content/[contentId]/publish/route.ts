import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import {
  YouTubeApiError,
  getAccessTokenForProfile,
  publishVideoNow,
} from "@/lib/youtube/client";
import { YouTubeNotConfiguredError } from "@/lib/youtube/config";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

/**
 * Explicit opt-in. The client sends this only after the user types/accepts a
 * confirmation dialog, and the flag means an accidental POST can't publish.
 */
const publishSchema = z.object({
  confirm: z.literal(true),
});

/** POST /api/content/[contentId]/publish — makes the video public now. */
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

  if (!item.youtubeVideoId) {
    return NextResponse.json(
      { error: "Upload the video before publishing." },
      { status: 409 }
    );
  }

  try {
    publishSchema.parse(await request.json());

    const accessToken = await getAccessTokenForProfile(profileId);
    await publishVideoNow(accessToken, item.youtubeVideoId);

    const updated = await prisma.contentItem.update({
      where: { id: contentId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        scheduledAt: null,
        errorMessage: null,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Publishing requires explicit confirmation." },
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
      { error: "Could not publish the video." },
      { status: 500 }
    );
  }
}

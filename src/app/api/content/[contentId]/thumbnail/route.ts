import { NextResponse } from "next/server";

import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import {
  MAX_THUMBNAIL_BYTES,
  isAllowedThumbnailType,
} from "@/lib/content";
import {
  YouTubeApiError,
  getAccessTokenForProfile,
  setThumbnail,
} from "@/lib/youtube/client";
import { YouTubeNotConfiguredError } from "@/lib/youtube/config";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

/**
 * POST /api/content/[contentId]/thumbnail — multipart image upload.
 *
 * Thumbnails are capped at 2 MB, so proxying them is fine; the rule about not
 * proxying applies to the video file.
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

  if (!item.youtubeVideoId) {
    return NextResponse.json(
      { error: "Upload the video before setting a thumbnail." },
      { status: 409 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("thumbnail");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No thumbnail file was provided." },
        { status: 400 }
      );
    }

    if (!isAllowedThumbnailType(file.type)) {
      return NextResponse.json(
        { error: "Thumbnails must be JPEG or PNG." },
        { status: 400 }
      );
    }

    if (file.size > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json(
        { error: "Thumbnails must be 2 MB or smaller." },
        { status: 400 }
      );
    }

    const accessToken = await getAccessTokenForProfile(profileId);
    await setThumbnail(
      accessToken,
      item.youtubeVideoId,
      await file.arrayBuffer(),
      file.type
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof YouTubeNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    if (err instanceof YouTubeApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Could not set the thumbnail." },
      { status: 500 }
    );
  }
}

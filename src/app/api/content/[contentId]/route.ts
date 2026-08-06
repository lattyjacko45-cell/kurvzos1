import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOwnedContent, requireProfileId } from "@/lib/content.server";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TAG_COUNT,
  MAX_TITLE_LENGTH,
  hasErrors,
  validatePublishingDetails,
} from "@/lib/content";
import { isValidTimeZone } from "@/lib/timezone";

interface RouteContext {
  params: Promise<{ contentId: string }>;
}

const updateContentSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).default(""),
  tags: z.array(z.string().trim().min(1).max(100)).max(MAX_TAG_COUNT).default([]),
  categoryId: z.string().trim().min(1).max(10),
  madeForKids: z.boolean(),
  contentType: z.enum(["LONG_FORM", "SHORT"]),
  /**
   * ISO instant in UTC, already converted from the user's zone.
   * Parsed manually rather than with z.string().datetime(), whose home moved
   * to z.iso.datetime() in Zod 4.
   */
  scheduledAt: z.string().trim().min(1).max(40).nullable(),
  timezone: z.string().trim().min(1).max(100),
});

export async function GET(_request: Request, context: RouteContext) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await context.params;
  const item = await findOwnedContent(contentId, profileId);

  if (!item) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

/** PATCH — save publishing details. Re-validates everything server-side. */
export async function PATCH(request: Request, context: RouteContext) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await context.params;
  const existing = await findOwnedContent(contentId, profileId);

  if (!existing) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  // Once a video exists on YouTube, its metadata is no longer ours to rewrite
  // from this endpoint.
  if (existing.youtubeVideoId) {
    return NextResponse.json(
      { error: "This content has already been uploaded to YouTube." },
      { status: 409 }
    );
  }

  try {
    const data = updateContentSchema.parse(await request.json());

    if (!isValidTimeZone(data.timezone)) {
      return NextResponse.json(
        { error: "Unknown timezone.", fieldErrors: { timezone: "Unknown timezone." } },
        { status: 400 }
      );
    }

    const fieldErrors = validatePublishingDetails({
      title: data.title,
      description: data.description,
      tags: data.tags,
      categoryId: data.categoryId,
      madeForKids: data.madeForKids,
      contentType: data.contentType,
      scheduledAt: data.scheduledAt,
      timezone: data.timezone,
    });

    if (hasErrors(fieldErrors)) {
      return NextResponse.json(
        { error: "Please fix the highlighted fields.", fieldErrors },
        { status: 400 }
      );
    }

    const item = await prisma.contentItem.update({
      where: { id: contentId },
      data: {
        title: data.title,
        description: data.description,
        tags: data.tags,
        categoryId: data.categoryId,
        madeForKids: data.madeForKids,
        contentType: data.contentType,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        timezone: data.timezone,
        status: existing.status === "DRAFT" ? "READY" : existing.status,
        errorMessage: null,
      },
    });

    return NextResponse.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await context.params;
  const existing = await findOwnedContent(contentId, profileId);

  if (!existing) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  await prisma.contentItem.delete({ where: { id: contentId } });

  return NextResponse.json({ success: true });
}

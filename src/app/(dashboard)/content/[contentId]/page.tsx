import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getYouTubeSetupState } from "@/lib/youtube/config";
import { YouTubeConnectionCard } from "@/components/content/youtube-connection-card";
import {
  ContentDetail,
  type ContentDetailItem,
} from "@/components/content/content-detail";
import type { ContentStatusValue, ContentTypeValue } from "@/lib/content";

export const metadata: Metadata = {
  title: "Content Item",
};

interface ContentDetailPageProps {
  params: Promise<{ contentId: string }>;
}

export default async function ContentDetailPage({
  params,
}: ContentDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const { contentId } = await params;

  // Scoped by profile: another user's id resolves to a 404, not a 403 leak.
  const item = await prisma.contentItem.findFirst({
    where: { id: contentId, profileId: profile.id },
    include: {
      task: { select: { id: true, title: true, status: true } },
      project: { select: { name: true } },
    },
  });

  if (!item) {
    notFound();
  }

  const connection = await prisma.youTubeConnection.findUnique({
    where: { profileId: profile.id },
    select: { channelTitle: true },
  });

  const setupState = getYouTubeSetupState();

  const detail: ContentDetailItem = {
    id: item.id,
    title: item.title,
    description: item.description,
    tags: item.tags,
    categoryId: item.categoryId,
    madeForKids: item.madeForKids,
    contentType: item.contentType as ContentTypeValue,
    status: item.status as ContentStatusValue,
    scheduledAt: item.scheduledAt ? item.scheduledAt.toISOString() : null,
    timezone: item.timezone,
    youtubeVideoId: item.youtubeVideoId,
    youtubeUrl: item.youtubeUrl,
    uploadProgress: item.uploadProgress,
    processingStatus: item.processingStatus,
    errorMessage: item.errorMessage,
    taskId: item.task?.id ?? null,
    taskTitle: item.task?.title ?? null,
    taskStatus: item.task?.status ?? null,
    projectName: item.project?.name ?? null,
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <YouTubeConnectionCard
        configured={setupState.configured}
        missingEnv={setupState.missing}
        channelTitle={connection?.channelTitle ?? null}
      />

      <ContentDetail
        item={detail}
        youtubeConnected={Boolean(connection) && setupState.configured}
        browserTimezone="UTC"
      />
    </div>
  );
}

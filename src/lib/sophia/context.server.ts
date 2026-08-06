import { prisma } from "@/lib/prisma";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import { getLatestHarperAdvice } from "@/lib/harper/engine.server";
import { harperAnswerSchema } from "@/lib/harper/types";
import { getLatestReneeAdvice } from "@/lib/renee/engine.server";
import { reneeAnswerSchema } from "@/lib/renee/types";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  type ContentStatusValue,
  type ContentTypeValue,
} from "@/lib/content";
import type { SophiaContext } from "@/lib/sophia/types";

/**
 * Assembles Sophia's marketing context.
 *
 * Same rules as the other executives:
 *  1. Every query is scoped to the caller's own profile/workspace.
 *  2. Only human-readable pipeline data leaves here. Statuses and formats are
 *     translated to plain language *before* serialisation, and the YouTube
 *     video id, watch URL and connection record are never selected at all.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Feedback worth a marketer's attention. */
const MARKETING_KEYWORDS = [
  "content",
  "video",
  "youtube",
  "short",
  "thumbnail",
  "publish",
  "schedule",
  "audience",
  "growth",
  "brand",
  "post",
  "channel",
];

export async function buildSophiaContext(
  profileId: string,
  workspaceId: string,
  now: Date = new Date()
): Promise<SophiaContext> {
  const since7 = new Date(now.getTime() - SEVEN_DAYS_MS);
  const since30 = new Date(now.getTime() - THIRTY_DAYS_MS);

  const [
    briefing,
    packet,
    contentItems,
    projects,
    focusSessions,
    feedback,
    harper,
    renee,
  ] = await Promise.all([
    getDailyBriefing(workspaceId, now),
    getWeeklyPacket(workspaceId, now),
    prisma.contentItem.findMany({
      where: { profileId },
      // Deliberately narrow: no youtubeVideoId, no youtubeUrl, no tokens.
      select: {
        title: true,
        contentType: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        projectId: true,
        taskId: true,
        task: { select: { title: true, status: true, dueDate: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.project.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { id: true, name: true, description: true },
    }),
    prisma.focusSession.findMany({
      where: {
        profileId,
        status: "COMPLETED",
        endedAt: { gte: since7, lte: now },
      },
      select: { durationMinutes: true },
    }),
    prisma.feedback.findMany({
      where: { profileId, status: { in: ["NEW", "REVIEWING"] } },
      select: { type: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getLatestHarperAdvice(profileId),
    getLatestReneeAdvice(profileId),
  ]);

  // Tasks that carry content are the marketing workload.
  const contentTasks = contentItems
    .filter((item) => item.task !== null)
    .map((item) => item.task as NonNullable<typeof item.task>);

  const openContentTasks = contentTasks.filter(
    (task) => task.status !== "DONE"
  );
  const overdueContentTasks = openContentTasks.filter(
    (task) => task.dueDate !== null && task.dueDate.getTime() < now.getTime()
  );

  const recentCompletedContentTasks = await prisma.task.findMany({
    where: {
      project: { workspaceId },
      status: "DONE",
      updatedAt: { gte: since7 },
      contentItems: { some: { profileId } },
    },
    select: { title: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  const publishedItems = contentItems.filter(
    (item) => item.status === "PUBLISHED"
  );
  const lastPublishedAt = publishedItems
    .map((item) => item.publishedAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const projectActivity = new Map(
    packet.projects.map((project) => [project.id, project])
  );

  const countByStatus = (status: ContentStatusValue) =>
    contentItems.filter((item) => item.status === status).length;

  const harperParsed = harper
    ? harperAnswerSchema.safeParse(harper.response)
    : null;
  const reneeParsed = renee
    ? reneeAnswerSchema.safeParse(renee.response)
    : null;

  const missionIsContentWork = briefing.mission
    ? contentItems.some((item) => item.task?.title === briefing.mission?.title)
    : false;

  return {
    generatedAt: now.toISOString(),
    contentPipeline: contentItems.slice(0, 20).map((item) => ({
      title: item.title,
      // Plain language at the source, so no enum can leak downstream.
      format: CONTENT_TYPE_LABELS[item.contentType as ContentTypeValue],
      stage: CONTENT_STATUS_LABELS[item.status as ContentStatusValue],
      scheduledFor: item.scheduledAt
        ? item.scheduledAt.toISOString().slice(0, 10)
        : null,
      publishedOn: item.publishedAt
        ? item.publishedAt.toISOString().slice(0, 10)
        : null,
      linkedTask: item.task?.title ?? null,
    })),
    pipelineCounts: {
      drafts: countByStatus("DRAFT"),
      readyOrUploading:
        countByStatus("READY") +
        countByStatus("UPLOADING") +
        countByStatus("PROCESSING"),
      scheduled: countByStatus("SCHEDULED"),
      published: publishedItems.length,
      failed: countByStatus("FAILED"),
    },
    publishingCadence: {
      publishedLast30Days: publishedItems.filter(
        (item) => item.publishedAt && item.publishedAt >= since30
      ).length,
      daysSinceLastPublish: lastPublishedAt
        ? Math.floor((now.getTime() - lastPublishedAt.getTime()) / DAY_MS)
        : null,
      scheduledAhead: contentItems.filter(
        (item) =>
          item.status === "SCHEDULED" &&
          item.scheduledAt !== null &&
          item.scheduledAt.getTime() > now.getTime()
      ).length,
    },
    formats: {
      longForm: contentItems.filter((item) => item.contentType === "LONG_FORM")
        .length,
      shorts: contentItems.filter((item) => item.contentType === "SHORT")
        .length,
    },
    contentProjects: projects
      .map((project) => ({
        name: project.name,
        description: project.description,
        contentItems: contentItems.filter(
          (item) => item.projectId === project.id
        ).length,
        openTasks: projectActivity.get(project.id)?.openTasks ?? 0,
        completedThisWeek:
          projectActivity.get(project.id)?.completedThisWeek ?? 0,
      }))
      // A project with no content attached is not Sophia's business.
      .filter((project) => project.contentItems > 0),
    contentWork: {
      openContentTasks: openContentTasks.length,
      overdueContentTasks: overdueContentTasks.length,
      recentCompletedContentTasks: recentCompletedContentTasks.map(
        (task) => task.title
      ),
    },
    mission: briefing.mission
      ? {
          title: briefing.mission.title,
          projectName: briefing.mission.projectName,
          isContentWork: missionIsContentWork,
        }
      : null,
    weeklyPacket: {
      weeklyPriority: packet.priorityTask?.title ?? null,
      risks: packet.risks.map((risk) => `${risk.title} — ${risk.detail}`),
    },
    focus: {
      minutesLast7Days: focusSessions.reduce(
        (total, session) => total + (session.durationMinutes ?? 0),
        0
      ),
      sessionsLast7Days: focusSessions.length,
    },
    latestHarperNextMove: harperParsed?.success
      ? harperParsed.data.nextMove
      : null,
    latestReneeStrategicPriority: reneeParsed?.success
      ? reneeParsed.data.strategicPriority
      : null,
    marketingFeedback: feedback
      .filter((entry) =>
        MARKETING_KEYWORDS.some((keyword) =>
          entry.description.toLowerCase().includes(keyword)
        )
      )
      .slice(0, 3)
      .map((entry) => ({
        type: entry.type.toLowerCase().replace(/_/g, " "),
        description: entry.description.slice(0, 200),
      })),
  };
}

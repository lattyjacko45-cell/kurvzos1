import { z } from "zod";

import type { SophiaContext } from "@/lib/sophia/types";

/**
 * Staleness and significance for Sophia.
 *
 * Same split as Harper and Renee, tuned to the pipeline. Marketing advice goes
 * wrong when content moves stage, when the schedule empties, or when a drought
 * starts — not when a checklist step is ticked.
 */

export const sophiaContextSchema = z.object({
  generatedAt: z.string(),
  contentPipeline: z.array(
    z.object({
      title: z.string(),
      format: z.string(),
      stage: z.string(),
      scheduledFor: z.string().nullable(),
      publishedOn: z.string().nullable(),
      linkedTask: z.string().nullable(),
    })
  ),
  pipelineCounts: z.object({
    drafts: z.number(),
    readyOrUploading: z.number(),
    scheduled: z.number(),
    published: z.number(),
    failed: z.number(),
  }),
  publishingCadence: z.object({
    publishedLast30Days: z.number(),
    daysSinceLastPublish: z.number().nullable(),
    scheduledAhead: z.number(),
  }),
  formats: z.object({ longForm: z.number(), shorts: z.number() }),
  contentProjects: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      contentItems: z.number(),
      openTasks: z.number(),
      completedThisWeek: z.number(),
    })
  ),
  contentWork: z.object({
    openContentTasks: z.number(),
    overdueContentTasks: z.number(),
    recentCompletedContentTasks: z.array(z.string()),
  }),
  mission: z
    .object({
      title: z.string(),
      projectName: z.string(),
      isContentWork: z.boolean(),
    })
    .nullable(),
  weeklyPacket: z.object({
    weeklyPriority: z.string().nullable(),
    risks: z.array(z.string()),
  }),
  focus: z.object({
    minutesLast7Days: z.number(),
    sessionsLast7Days: z.number(),
  }),
  latestHarperNextMove: z.string().nullable(),
  latestReneeStrategicPriority: z.string().nullable(),
  marketingFeedback: z.array(
    z.object({ type: z.string(), description: z.string() })
  ),
});

export function parseStoredSophiaContext(
  value: unknown
): SophiaContext | null {
  const parsed = sophiaContextSchema.safeParse(value);
  return parsed.success ? (parsed.data as SophiaContext) : null;
}

/** Title plus stage for every item — catches creation and stage changes. */
function pipelineSignature(context: SophiaContext): string {
  return context.contentPipeline
    .map((item) => `${item.title}:${item.stage}:${item.scheduledFor ?? "-"}`)
    .sort()
    .join(",");
}

/**
 * Fields that make marketing advice right or wrong. Focus minutes and feedback
 * are excluded — they move without changing what to publish next.
 */
export function sophiaFingerprint(context: SophiaContext): string {
  return [
    pipelineSignature(context),
    context.pipelineCounts.drafts,
    context.pipelineCounts.readyOrUploading,
    context.pipelineCounts.scheduled,
    context.pipelineCounts.published,
    context.pipelineCounts.failed,
    context.publishingCadence.scheduledAhead,
    context.contentWork.openContentTasks,
    context.contentWork.overdueContentTasks,
    context.mission?.title ?? "none",
  ].join("|");
}

export function isSophiaContextStale(
  saved: SophiaContext | null,
  current: SophiaContext
): boolean {
  if (!saved) return true;
  return sophiaFingerprint(saved) !== sophiaFingerprint(current);
}

/**
 * Worth a model call. Ordinary checklist churn is not — that is what the
 * deterministic pipeline read is for.
 */
export function isSophiaSignificantChange(
  saved: SophiaContext | null,
  current: SophiaContext
): boolean {
  if (!saved) return true;

  // A content item was created, or one changed stage (including
  // scheduled → published).
  if (pipelineSignature(saved) !== pipelineSignature(current)) return true;

  // A content task was completed.
  if (
    saved.contentWork.openContentTasks !== current.contentWork.openContentTasks
  ) {
    return true;
  }

  // The primary mission changed, or moved into or out of content work.
  if ((saved.mission?.title ?? null) !== (current.mission?.title ?? null)) {
    return true;
  }
  if (
    (saved.mission?.isContentWork ?? false) !==
    (current.mission?.isContentWork ?? false)
  ) {
    return true;
  }

  // The schedule emptied or refilled.
  if (
    saved.publishingCadence.scheduledAhead !==
    current.publishingCadence.scheduledAhead
  ) {
    return true;
  }

  return false;
}

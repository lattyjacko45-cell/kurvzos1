import type { SophiaAnswer, SophiaContext } from "@/lib/sophia/types";

/**
 * Deterministic Sophia.
 *
 * Reads the pipeline the way a marketer would triage it: is anything shipping,
 * is anything queued, is anything stuck, and is there a drought. It never
 * speculates about views, subscribers or engagement — KurvzOS holds no such
 * data, so inventing it would be worse than saying nothing.
 */

/** A gap of this many days reads as a publishing drought. */
const DROUGHT_DAYS = 14;

export function buildSophiaFallback(
  context: SophiaContext,
  question: string | null
): SophiaAnswer {
  const { pipelineCounts, publishingCadence, formats, contentPipeline } =
    context;

  const answer = question
    ? "I am running without a model connection, so this is my rule-based read of your content pipeline rather than a direct answer to your question."
    : null;

  const totalItems =
    pipelineCounts.drafts +
    pipelineCounts.readyOrUploading +
    pipelineCounts.scheduled +
    pipelineCounts.published +
    pipelineCounts.failed;

  // Nothing to work with yet.
  if (totalItems === 0) {
    return {
      marketingPriority: "Start the content pipeline",
      contentRecommendation:
        "Create your first content item and attach it to a task so it moves through planning to publishing.",
      channelFocus: "Long-form video",
      promotionOpportunity: null,
      marketingRisk:
        "There is no content in the pipeline, so there is nothing to publish or promote.",
      whyThisMatters:
        "Without anything in the pipeline there is no publishing rhythm to build on and no audience signal to learn from.",
      answer,
    };
  }

  const mostRecentPublished = contentPipeline.find(
    (item) => item.publishedOn !== null
  );
  const nextScheduled = contentPipeline
    .filter((item) => item.scheduledFor !== null && item.publishedOn === null)
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))[0];
  const oldestDraft = contentPipeline
    .slice()
    .reverse()
    .find((item) => item.stage === "Draft" || item.stage === "Ready");
  const stalled = contentPipeline.find((item) => item.stage === "Failed");

  const channelFocus =
    formats.shorts > formats.longForm
      ? "Short-form"
      : formats.longForm > formats.shorts
        ? "Long-form video"
        : "Long-form video, with shorts cut from it";

  // Priority follows the biggest constraint in the pipeline.
  let marketingPriority: string;
  let contentRecommendation: string;

  if (stalled) {
    marketingPriority = `Recover the failed upload for “${stalled.title}”`;
    contentRecommendation = `Retry the upload for “${stalled.title}” — it is occupying a slot without reaching an audience.`;
  } else if (pipelineCounts.scheduled === 0 && oldestDraft) {
    marketingPriority = "Get something back on the schedule";
    contentRecommendation = `Finish “${oldestDraft.title}” and schedule it, so there is a confirmed next publish date.`;
  } else if (nextScheduled) {
    marketingPriority = `Ship “${nextScheduled.title}” on time`;
    contentRecommendation = `Protect the ${nextScheduled.scheduledFor} slot for “${nextScheduled.title}” and finish its remaining checklist work first.`;
  } else if (oldestDraft) {
    marketingPriority = "Move drafts into the schedule";
    contentRecommendation = `Take “${oldestDraft.title}” from draft to a scheduled date this week.`;
  } else {
    marketingPriority = "Plan the next piece of content";
    contentRecommendation =
      "Create the next content item now so the schedule does not run dry after the current one publishes.";
  }

  const promotionOpportunity = mostRecentPublished
    ? `“${mostRecentPublished.title}” is already published — repurpose it into a ${formats.shorts >= formats.longForm ? "long-form follow-up" : "short"} rather than starting from scratch.`
    : null;

  const drought =
    publishingCadence.daysSinceLastPublish !== null &&
    publishingCadence.daysSinceLastPublish >= DROUGHT_DAYS;

  const marketingRisk = drought
    ? `Nothing has published in ${publishingCadence.daysSinceLastPublish} days, so the publishing rhythm has broken.`
    : publishingCadence.scheduledAhead === 0
      ? "Nothing is scheduled ahead, so there is no confirmed next publish date."
      : context.contentWork.overdueContentTasks > 0
        ? `${context.contentWork.overdueContentTasks} content task${context.contentWork.overdueContentTasks === 1 ? " is" : "s are"} overdue, which puts the schedule at risk.`
        : pipelineCounts.failed > 0
          ? `${pipelineCounts.failed} upload${pipelineCounts.failed === 1 ? " has" : "s have"} failed and need attention.`
          : null;

  const whyThisMatters = [
    `The pipeline holds ${pipelineCounts.drafts} draft${pipelineCounts.drafts === 1 ? "" : "s"}, ${pipelineCounts.scheduled} scheduled and ${pipelineCounts.published} published.`,
    publishingCadence.publishedLast30Days > 0
      ? `${publishingCadence.publishedLast30Days} published in the last 30 days.`
      : "Nothing has published in the last 30 days.",
  ].join(" ");

  return {
    marketingPriority,
    contentRecommendation,
    channelFocus,
    promotionOpportunity,
    marketingRisk,
    whyThisMatters,
    answer,
  };
}

import type { ReneeAnswer, ReneeContext } from "@/lib/renee/types";

/**
 * Deterministic Renee.
 *
 * Runs when no model is configured or the call fails. Strategy is inferred
 * from what the data can actually support: which active project is carrying
 * the work, whether effort is spread thin, and what is overdue or stalled.
 * It never speculates about revenue or audience — there is no such data.
 */

interface RankedProject {
  name: string;
  status: string;
  openTasks: number;
  completedThisWeek: number;
  description: string | null;
}

/** The project absorbing the most effort is the de facto strategic bet. */
function rankProjects(context: ReneeContext): RankedProject[] {
  return context.projects
    .filter((project) => project.status === "ACTIVE")
    .slice()
    .sort((a, b) => {
      const activityDiff =
        b.completedThisWeek + b.openTasks - (a.completedThisWeek + a.openTasks);
      if (activityDiff !== 0) return activityDiff;
      return b.completedThisWeek - a.completedThisWeek;
    });
}

export function buildReneeFallback(
  context: ReneeContext,
  question: string | null
): ReneeAnswer {
  const ranked = rankProjects(context);
  const lead = ranked[0] ?? null;
  const trailing = ranked.slice(1);
  const scheduledContent = context.content.filter(
    (item) => item.status === "SCHEDULED" || item.status === "PUBLISHED"
  );

  const answer = question
    ? "I am running without a model connection, so this is my rule-based read of your business data rather than a direct answer to your question."
    : null;

  if (!lead) {
    return {
      strategicPriority: "Define an active project to invest in",
      alignmentCheck:
        "There is no active project, so there is nothing for current work to align to.",
      strategicRecommendation:
        "Create or reactivate one project and give it a description that states the outcome you want from it.",
      whatToDeprioritize: null,
      whyThisMatters:
        "Without an active project, effort has no business outcome attached to it and progress cannot be judged.",
      answer,
    };
  }

  // A project with no description gives Renee nothing to judge alignment by.
  const missingDescriptions = ranked.filter(
    (project) => !project.description?.trim()
  );

  const missionProject = context.mission?.projectName ?? null;
  const missionAligned = missionProject === lead.name;

  const alignmentCheck = !context.mission
    ? `Nothing is actively in flight, so no work is currently supporting “${lead.name}”.`
    : missionAligned
      ? `Your current mission “${context.mission.title}” sits inside “${lead.name}”, so today's execution supports the priority.`
      : `Your current mission “${context.mission.title}” belongs to “${missionProject}”, not “${lead.name}” — today's execution is pulling away from the priority.`;

  const deprioritize =
    trailing.length > 0 && trailing[0].openTasks > 0
      ? `“${trailing[0].name}” — ${trailing[0].openTasks} open task${trailing[0].openTasks === 1 ? "" : "s"} competing with the priority.`
      : context.workload.overdue > 0
        ? `Anything not tied to “${lead.name}” until the ${context.workload.overdue} overdue item${context.workload.overdue === 1 ? " is" : "s are"} cleared.`
        : null;

  const recommendation = missingDescriptions.length > 0
    ? `Write an outcome statement for ${missingDescriptions.length === 1 ? `“${missingDescriptions[0].name}”` : `${missingDescriptions.length} projects that have none`}, so alignment can be judged against something concrete.`
    : missionAligned
      ? `Keep effort concentrated on “${lead.name}” and finish “${context.mission?.title ?? "the current mission"}” before opening new work.`
      : `Move today's effort back to “${lead.name}”, or consciously accept that “${missionProject}” is now the priority.`;

  const why = [
    `“${lead.name}” carries ${lead.openTasks} open task${lead.openTasks === 1 ? "" : "s"} and ${lead.completedThisWeek} completed this week — more than any other active project.`,
    context.workload.overdue > 0
      ? `${context.workload.overdue} item${context.workload.overdue === 1 ? " is" : "s are"} overdue.`
      : null,
    scheduledContent.length > 0
      ? `${scheduledContent.length} content item${scheduledContent.length === 1 ? " is" : "s are"} scheduled or published.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    strategicPriority: lead.name,
    alignmentCheck,
    strategicRecommendation: recommendation,
    whatToDeprioritize: deprioritize,
    whyThisMatters: why,
    answer,
  };
}

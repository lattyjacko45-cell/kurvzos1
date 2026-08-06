import type { HarperAnswer, HarperContext } from "@/lib/harper/types";

/**
 * Deterministic Harper.
 *
 * Runs whenever no AI provider is configured or the model call fails or returns
 * something off-schema. It reuses the ranking already baked into the context
 * (the Daily Briefing selector picked the mission; the CEO Packet found the
 * risks), so its advice never contradicts the rest of the app.
 */
export function buildFallbackAdvice(
  context: HarperContext,
  question: string | null
): HarperAnswer {
  const { mission, checklist, counts, weeklyPacket } = context;

  if (!mission) {
    return {
      currentPriority: "No actionable task",
      nextMove:
        counts.activeProjects > 0
          ? "Create the next task for one of your active projects."
          : "Create a project, then add the first task for it.",
      whyThisMatters:
        "Nothing in the workspace is currently actionable, so there is no priority to protect.",
      watchOutFor:
        counts.overdue > 0
          ? `${counts.overdue} overdue task${counts.overdue === 1 ? "" : "s"} still need attention.`
          : null,
      answer: question
        ? "I do not have an actionable task in your workspace right now, so I cannot recommend one. Create a task and ask me again."
        : null,
    };
  }

  const nextMove = checklist.currentStep
    ? `${mission.status === "IN_PROGRESS" ? "Continue" : "Start"} “${mission.title}” by completing “${checklist.currentStep}”.`
    : checklist.totalSteps > 0
      ? `Close out “${mission.title}” — every checklist step is done.`
      : `Break “${mission.title}” into checklist steps, then start the first one.`;

  const why = mission.isOverdue
    ? `“${mission.title}” is past its due date, so it is blocking everything behind it.`
    : checklist.totalSteps > 0
      ? `You are ${checklist.completedSteps} of ${checklist.totalSteps} steps through this mission. Finishing it clears the most ground today.`
      : `This is the highest-ranked actionable task in ${mission.projectName}.`;

  const risk =
    weeklyPacket.risks[0] ??
    (counts.overdue > 0
      ? `${counts.overdue} task${counts.overdue === 1 ? " is" : "s are"} overdue.`
      : counts.dueToday > 1
        ? `${counts.dueToday} tasks are due today.`
        : null);

  return {
    currentPriority: mission.title,
    nextMove,
    whyThisMatters: why,
    watchOutFor: risk,
    answer: question
      ? "I am running without a model connection, so this is my rule-based read of your workspace rather than a direct answer to your question."
      : null,
  };
}

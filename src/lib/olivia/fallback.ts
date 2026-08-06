import type { OliviaAnswer, OliviaContext } from "@/lib/olivia/types";

/**
 * Deterministic Olivia.
 *
 * Bottlenecks are detected in severity order and the first match wins, so the
 * output is always a single diagnosis rather than a list of complaints. The
 * order reflects how much each problem costs: work that is finished but not
 * closed is pure waste, overdue work is commitment failure, stalled work is
 * drift, and missing process is the cheapest to fix.
 */

interface Bottleneck {
  priority: string;
  bottleneck: string;
  recommendation: string;
  systemOpportunity: string | null;
  risk: string | null;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function detect(context: OliviaContext): Bottleneck | null {
  const {
    finishedButOpenTasks,
    overdueTasks,
    stalledTasks,
    tasksWithoutChecklist,
    projects,
    contentPipeline,
    focus,
    feedback,
  } = context;

  // 1. Completed work that was never closed out — a missed handoff.
  if (finishedButOpenTasks.length > 0) {
    const first = finishedButOpenTasks[0];

    return {
      priority: "Close out finished work",
      bottleneck: `${finishedButOpenTasks.length} ${plural(finishedButOpenTasks.length, "task has", "tasks have")} every checklist step ticked but ${plural(finishedButOpenTasks.length, "is", "are")} still open, starting with “${first.title}”.`,
      recommendation: `Mark “${first.title}” complete now, then make closing the task the final checklist step on future work so the handoff cannot be skipped.`,
      systemOpportunity:
        "Add a standing final step — “close and hand off” — to your task templates.",
      risk: "Finished work that stays open hides real capacity and inflates the open task count.",
    };
  }

  // 2. Overdue commitments.
  if (overdueTasks.length > 0) {
    const worst = [...overdueTasks].sort(
      (a, b) => b.daysOverdue - a.daysOverdue
    )[0];

    return {
      priority: "Clear the overdue backlog",
      bottleneck: `${overdueTasks.length} ${plural(overdueTasks.length, "task is", "tasks are")} past their due date, the oldest being “${worst.title}” at ${worst.daysOverdue} ${plural(worst.daysOverdue, "day", "days")} overdue.`,
      recommendation: `Either finish “${worst.title}” today or move its due date deliberately — leaving it silently overdue removes the signal a due date is for.`,
      systemOpportunity:
        "Set a weekly slot to triage due dates instead of letting them drift.",
      risk: "A backlog of overdue work makes every remaining deadline less believable.",
    };
  }

  // 3. Work that has not moved in a week.
  if (stalledTasks.length > 0) {
    const oldest = [...stalledTasks].sort(
      (a, b) => b.daysSinceUpdate - a.daysSinceUpdate
    )[0];

    return {
      priority: "Restart or retire stalled work",
      bottleneck: `${stalledTasks.length} open ${plural(stalledTasks.length, "task has", "tasks have")} not moved in over a week; “${oldest.title}” has been untouched for ${oldest.daysSinceUpdate} days at the “${oldest.stage}” stage.`,
      recommendation: `Decide “${oldest.title}” in one pass: take the next concrete step on it today, or close it. Leaving it open costs attention every time you scan the list.`,
      systemOpportunity:
        "Review anything untouched for a week during your weekly packet review.",
      risk: "Stalled work quietly becomes the backlog you stop trusting.",
    };
  }

  // 4. Work with no defined process.
  if (tasksWithoutChecklist.length > 0) {
    const first = tasksWithoutChecklist[0];

    return {
      priority: "Give work a defined process",
      bottleneck: `${tasksWithoutChecklist.length} open ${plural(tasksWithoutChecklist.length, "task has", "tasks have")} no checklist, starting with “${first.title}”, so there is no defined next step inside them.`,
      recommendation: `Break “${first.title}” into checklist steps before starting it — an undefined task is the one most likely to stall.`,
      systemOpportunity:
        "If this kind of work repeats, save it as a task template so the steps come pre-filled.",
      risk: "Work without steps is hard to resume after an interruption.",
    };
  }

  // 5. Active projects with nothing actionable.
  const idleProjects = projects.filter(
    (project) => project.status === "active" && !project.hasActionableWork
  );

  if (idleProjects.length > 0) {
    const idle = idleProjects[0];

    return {
      priority: "Reactivate or archive idle projects",
      bottleneck: `“${idle.name}” is active but has no actionable work, and has seen no activity for ${idle.daysSinceActivity} ${plural(idle.daysSinceActivity, "day", "days")}.`,
      recommendation: `Add the next task to “${idle.name}” or archive it, so your active list reflects what is genuinely in play.`,
      systemOpportunity:
        "Make “does every active project have a next task?” part of your weekly review.",
      risk: "Idle projects make the workspace look busier than it is.",
    };
  }

  // 6. Content stuck mid-pipeline.
  const failed = contentPipeline.find((stage) => stage.stage === "Failed");
  if (failed && failed.count > 0) {
    return {
      priority: "Unblock stuck content",
      bottleneck: `${failed.count} content ${plural(failed.count, "item", "items")} failed to publish and ${plural(failed.count, "is", "are")} sitting in the pipeline.`,
      recommendation:
        "Retry the failed upload, or delete the item if it is no longer wanted, so the pipeline reflects reality.",
      systemOpportunity:
        "Check the pipeline for failures as part of publishing, rather than discovering them later.",
      risk: "Failed items make the content pipeline unreliable as a planning surface.",
    };
  }

  // 7. No focused execution at all.
  if (focus.sessionsLast7Days === 0 && context.workload.openTasks > 0) {
    return {
      priority: "Protect execution time",
      bottleneck: `There are ${context.workload.openTasks} open ${plural(context.workload.openTasks, "task", "tasks")} but no focus sessions were recorded in the last 7 days.`,
      recommendation:
        "Run one focus session on the current mission today, so progress is measured rather than assumed.",
      systemOpportunity:
        "Anchor a focus session to the same point each day so it stops being a decision.",
      risk: "Without recorded focus time there is no evidence of where effort actually goes.",
    };
  }

  // 8. Repeated friction reports.
  if (feedback.unresolved >= 3) {
    return {
      priority: "Resolve accumulated friction reports",
      bottleneck: `${feedback.unresolved} feedback ${plural(feedback.unresolved, "item is", "items are")} still unresolved.`,
      recommendation:
        "Triage the open feedback in one sitting and mark each item reviewing, fixed or dismissed.",
      systemOpportunity:
        "Handle feedback triage weekly so it never accumulates into a second backlog.",
      risk: "Unreviewed friction reports stop being written once they feel ignored.",
    };
  }

  return null;
}

export function buildOliviaFallback(
  context: OliviaContext,
  question: string | null
): OliviaAnswer {
  const answer = question
    ? "I am running without a model connection, so this is my rule-based read of how your work is flowing rather than a direct answer to your question."
    : null;

  const found = detect(context);

  if (!found) {
    const healthy =
      context.workload.openTasks > 0
        ? `${context.workload.openTasks} open ${plural(context.workload.openTasks, "task is", "tasks are")} moving, ${context.workload.completedThisWeek} completed this week.`
        : "There is no open work to diagnose.";

    return {
      operationsPriority: "Keep the current rhythm",
      currentBottleneck:
        "No bottleneck is visible in the data: nothing is overdue, stalled, or finished-but-open.",
      processRecommendation:
        "Keep working the current mission and re-check for friction after the next few tasks close.",
      systemOrDelegationOpportunity: null,
      operationsRisk: null,
      whyThisMatters: healthy,
      answer,
    };
  }

  const why = [
    `${context.workload.openTasks} open, ${context.workload.overdueTasks} overdue, ${context.workload.completedThisWeek} completed this week.`,
    context.focus.sessionsLast7Days > 0
      ? `${context.focus.sessionsLast7Days} focus ${plural(context.focus.sessionsLast7Days, "session", "sessions")} totalling ${context.focus.minutesLast7Days} minutes.`
      : "No focus sessions recorded in the last 7 days.",
  ].join(" ");

  return {
    operationsPriority: found.priority,
    currentBottleneck: found.bottleneck,
    processRecommendation: found.recommendation,
    systemOrDelegationOpportunity: found.systemOpportunity,
    operationsRisk: found.risk,
    whyThisMatters: why,
    answer,
  };
}

/**
 * Executive output hygiene.
 *
 * The context we hand a model is JSON, so its keys (`weeklyPriority`) and enum
 * values (`IN_PROGRESS`) are visible to it — and models echo what they see.
 * A prompt rule alone is not a guarantee, so every executive response passes
 * through here before it reaches the UI or the database.
 *
 * Pure and dependency-free; applies equally to AI and deterministic output.
 */

/** Context and advice keys, written the way a person would say them. */
const FIELD_LABELS: Record<string, string> = {
  // Renee's context
  weeklyPriority: "weekly priority",
  weeklyPacket: "weekly CEO packet",
  strategicPriority: "strategic priority",
  strategicRecommendation: "strategic recommendation",
  alignmentCheck: "alignment check",
  whatToDeprioritize: "what to deprioritize",
  whyThisMatters: "why this matters",
  latestHarperNextMove: "Harper's latest next move",
  recentCompletedTasks: "recently completed tasks",
  unresolvedFeedback: "unresolved feedback",
  activeProjects: "active projects",
  openTasks: "open tasks",
  completedThisWeek: "completed this week",
  dueToday: "due today",
  scheduledFor: "scheduled for",
  contentType: "content type",
  projectName: "project",
  isOverdue: "overdue",
  minutesLast7Days: "focus minutes in the last 7 days",
  sessionsLast7Days: "focus sessions in the last 7 days",
  generatedAt: "generated at",

  // Sophia's context and advice
  marketingPriority: "marketing priority",
  contentRecommendation: "content recommendation",
  channelFocus: "channel focus",
  promotionOpportunity: "promotion opportunity",
  marketingRisk: "marketing risk",
  contentPipeline: "content pipeline",
  pipelineCounts: "pipeline counts",
  publishingCadence: "publishing cadence",
  publishedLast30Days: "published in the last 30 days",
  daysSinceLastPublish: "days since the last publish",
  scheduledAhead: "scheduled ahead",
  readyOrUploading: "ready or uploading",
  contentProjects: "content projects",
  contentItems: "content items",
  contentWork: "content work",
  openContentTasks: "open content tasks",
  overdueContentTasks: "overdue content tasks",
  recentCompletedContentTasks: "recently completed content tasks",
  isContentWork: "content work",
  longForm: "long-form video",
  shorts: "shorts",
  publishedOn: "published on",
  linkedTask: "linked task",
  marketingFeedback: "marketing feedback",
  latestReneeStrategicPriority: "Renee's latest strategic priority",

  // Olivia's context and advice
  operationsPriority: "operations priority",
  currentBottleneck: "current bottleneck",
  processRecommendation: "process recommendation",
  systemOrDelegationOpportunity: "system or delegation opportunity",
  operationsRisk: "operations risk",
  tasksByStage: "tasks by stage",
  stalledTasks: "stalled tasks",
  finishedButOpenTasks: "finished but still open tasks",
  tasksWithoutChecklist: "tasks without a checklist",
  overdueTasks: "overdue tasks",
  daysSinceUpdate: "days since the last update",
  daysSinceActivity: "days since the last activity",
  daysOverdue: "days overdue",
  checklistProgress: "checklist progress",
  tasksWithChecklist: "tasks with a checklist",
  averagePercentComplete: "average percent complete",
  hasActionableWork: "has actionable work",
  averageSessionMinutes: "average session length in minutes",
  averageMinutesPerCompletedTask: "average minutes per completed task",
  latestSophiaMarketingPriority: "Sophia's latest marketing priority",

  // Marcus's context and advice
  financialPriority: "financial priority",
  cashPosition: "cash position",
  investmentRecommendation: "investment recommendation",
  costToWatch: "cost to watch",
  revenueOpportunity: "revenue opportunity",
  financialRisk: "financial risk",
  netCashFlow: "net cash flow",
  isCashFlowPositive: "cash-flow positive",
  revenueGap: "revenue gap",
  targetRevenue: "revenue target",
  availableCash: "available cash",
  operatingExpenses: "operating expenses",
  marketingSpend: "marketing spend",
  marketingPercentOfRevenue: "marketing as a percentage of revenue",
  monthlyBurn: "monthly burn",
  runwayMonths: "months of runway",
  missingFinancialData: "financial data not yet recorded",
  costRelatedFeedback: "cost-related feedback",
  latestOliviaOperationsPriority: "Olivia's latest operations priority",

  // Shared execution vocabulary
  currentPriority: "current priority",
  nextMove: "next move",
  watchOutFor: "watch out for",
  currentStep: "current step",
  nextStep: "next step",
  completedSteps: "completed steps",
  totalSteps: "total steps",
  dueDate: "due date",
  scheduledAt: "scheduled time",
};

/** Enum values the database stores, in plain English. */
const ENUM_LABELS: Record<string, string> = {
  // TaskStatus
  TODO: "not started",
  IN_PROGRESS: "in progress",
  REVIEW: "in review",
  DONE: "completed",

  // Priority
  LOW: "low priority",
  MEDIUM: "medium priority",
  HIGH: "high priority",
  URGENT: "urgent",

  // ProjectStatus / ContentStatus
  ACTIVE: "active",
  ARCHIVED: "archived",
  COMPLETED: "completed",
  DRAFT: "draft",
  READY: "ready",
  UPLOADING: "uploading",
  PROCESSING: "processing",
  UPLOADED: "uploaded and private",
  SCHEDULED: "scheduled",
  PUBLISHED: "published",
  FAILED: "failed",

  // ContentType
  LONG_FORM: "long-form video",
  SHORT: "short",

  // FeedbackType
  BUG: "bug",
  CONFUSING: "confusing",
  MISSING_FEATURE: "missing feature",
  IMPROVEMENT: "improvement",
};

/**
 * Domain words that mark a camelCase token as one of ours. Without this guard
 * a generic splitter would also mangle legitimate names a user might write,
 * such as "iPhone" or "eBay".
 */
const DOMAIN_WORDS = [
  "task",
  "tasks",
  "project",
  "projects",
  "priority",
  "status",
  "step",
  "steps",
  "content",
  "week",
  "weekly",
  "focus",
  "mission",
  "overdue",
  "due",
  "harper",
  "renee",
  "schedule",
  "scheduled",
  "publish",
  "published",
  "upload",
  "session",
  "sessions",
  "feedback",
  "packet",
  "marketing",
  "pipeline",
  "channel",
  "promotion",
  "cadence",
  "format",
  "formats",
  "draft",
  "drafts",
  "operations",
  "bottleneck",
  "process",
  "stage",
  "stages",
  "stalled",
  "overdue",
  "checklist",
  "delegation",
  "workload",
  "cash",
  "revenue",
  "financial",
  "expenses",
  "spend",
  "cost",
  "costs",
  "runway",
  "burn",
  "investment",
];

function splitCamelCase(token: string): string {
  return token.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites internal identifiers into natural language.
 * Safe to run repeatedly — the replacements produce plain words that no longer
 * match the patterns.
 */
export function humanizeExecutiveText(text: string): string {
  let output = text;

  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    output = output.replace(
      new RegExp(`\\b${escapeRegExp(key)}\\b`, "g"),
      label
    );
  }

  for (const [value, label] of Object.entries(ENUM_LABELS)) {
    // Enum tokens are matched case-sensitively so ordinary prose containing
    // the word "short" or "active" is left alone.
    output = output.replace(
      new RegExp(`(?<![A-Za-z_])${escapeRegExp(value)}(?![A-Za-z_])`, "g"),
      label
    );
  }

  // Anything camelCase we did not enumerate, but only when it is clearly ours.
  output = output.replace(
    /\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g,
    (token) => {
      const split = splitCamelCase(token);
      const isOurs = DOMAIN_WORDS.some((word) =>
        split.split(" ").includes(word)
      );

      return isOurs ? split : token;
    }
  );

  return output;
}

/** Applies the rewrite to every string field of an advice object. */
export function humanizeAdvice<T extends Record<string, unknown>>(
  advice: T
): T {
  const cleaned: Record<string, unknown> = { ...advice };

  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === "string") {
      cleaned[key] = humanizeExecutiveText(value);
    }
  }

  return cleaned as T;
}

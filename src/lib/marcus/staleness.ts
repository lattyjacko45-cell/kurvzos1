import { z } from "zod";

import type { MarcusContext } from "@/lib/marcus/types";

/**
 * Staleness and significance for Marcus.
 *
 * Financial advice goes wrong when the numbers change, when the portfolio
 * changes, or when content ships. It does not go wrong because a checklist item
 * was ticked or a timer ran.
 */

export const marcusContextSchema = z.object({
  generatedAt: z.string(),
  financials: z
    .object({
      period: z.string(),
      currency: z.string(),
      revenue: z.string(),
      operatingExpenses: z.string(),
      marketingSpend: z.string(),
      availableCash: z.string(),
      targetRevenue: z.string().nullable(),
      netCashFlow: z.string(),
      isCashFlowPositive: z.boolean(),
      revenueGap: z.string().nullable(),
      marketingPercentOfRevenue: z.number().nullable(),
      monthlyBurn: z.string().nullable(),
      runwayMonths: z.number().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
  missingFinancialData: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      openTasks: z.number(),
      completedThisWeek: z.number(),
    })
  ),
  workload: z.object({
    openTasks: z.number(),
    completedThisWeek: z.number(),
    overdueTasks: z.number(),
  }),
  focus: z.object({
    sessionsLast7Days: z.number(),
    minutesLast7Days: z.number(),
  }),
  content: z.object({
    published: z.number(),
    scheduled: z.number(),
    inProgress: z.number(),
    recentTitles: z.array(z.string()),
  }),
  weeklyPacket: z.object({
    weeklyPriority: z.string().nullable(),
    risks: z.array(z.string()),
  }),
  latestHarperNextMove: z.string().nullable(),
  latestReneeStrategicPriority: z.string().nullable(),
  latestSophiaMarketingPriority: z.string().nullable(),
  latestOliviaOperationsPriority: z.string().nullable(),
  costRelatedFeedback: z.array(
    z.object({ type: z.string(), description: z.string() })
  ),
});

export function parseStoredMarcusContext(
  value: unknown
): MarcusContext | null {
  const parsed = marcusContextSchema.safeParse(value);
  return parsed.success ? (parsed.data as MarcusContext) : null;
}

/** The entered figures, as a single comparable string. */
function financialSignature(context: MarcusContext): string {
  if (!context.financials) return "none";

  const f = context.financials;
  return [
    f.period,
    f.currency,
    f.revenue,
    f.operatingExpenses,
    f.marketingSpend,
    f.availableCash,
    f.targetRevenue ?? "-",
  ].join("~");
}

function projectSignature(context: MarcusContext): string {
  return context.projects
    .map((project) => `${project.name}:${project.status}`)
    .sort()
    .join(",");
}

/** Published and scheduled counts — the points where content becomes revenue-relevant. */
function shippedSignature(context: MarcusContext): string {
  return `${context.content.published}/${context.content.scheduled}`;
}

export function marcusFingerprint(context: MarcusContext): string {
  return [
    financialSignature(context),
    projectSignature(context),
    shippedSignature(context),
    context.workload.completedThisWeek,
    context.workload.overdueTasks,
    context.weeklyPacket.weeklyPriority ?? "none",
  ].join("|");
}

export function isMarcusContextStale(
  saved: MarcusContext | null,
  current: MarcusContext
): boolean {
  if (!saved) return true;
  return marcusFingerprint(saved) !== marcusFingerprint(current);
}

/**
 * Worth a model call. Note the absences: focus minutes, checklist progress and
 * open-task churn move constantly without changing a financial decision.
 */
export function isMarcusSignificantChange(
  saved: MarcusContext | null,
  current: MarcusContext
): boolean {
  if (!saved) return true;

  // Any entered figure changed, including the revenue target.
  if (financialSignature(saved) !== financialSignature(current)) return true;

  // A project was created, paused, completed or reopened.
  if (projectSignature(saved) !== projectSignature(current)) return true;

  // Content became scheduled or published.
  if (shippedSignature(saved) !== shippedSignature(current)) return true;

  // A task was completed or reopened.
  if (saved.workload.completedThisWeek !== current.workload.completedThisWeek) {
    return true;
  }

  return false;
}

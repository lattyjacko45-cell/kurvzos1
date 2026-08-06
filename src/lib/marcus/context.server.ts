import { prisma } from "@/lib/prisma";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import { getDailyBriefing } from "@/lib/daily-briefing.server";
import { getLatestHarperAdvice } from "@/lib/harper/engine.server";
import { harperAnswerSchema } from "@/lib/harper/types";
import { getLatestReneeAdvice } from "@/lib/renee/engine.server";
import { reneeAnswerSchema } from "@/lib/renee/types";
import { getLatestSophiaAdvice } from "@/lib/sophia/engine.server";
import { sophiaAnswerSchema } from "@/lib/sophia/types";
import { getLatestOliviaAdvice } from "@/lib/olivia/engine.server";
import { oliviaAnswerSchema } from "@/lib/olivia/types";
import {
  deriveFinancials,
  formatCents,
  formatPeriod,
  monthStart,
} from "@/lib/finance/money";
import type { MarcusContext } from "@/lib/marcus/types";

/**
 * Assembles Marcus's financial context.
 *
 * Two design choices worth knowing:
 *  1. Every monetary figure is pre-formatted into a display string, and every
 *     derivation is computed here. The model is never asked to do arithmetic,
 *     which is where financial hallucination usually starts.
 *  2. When figures are absent we say so explicitly in `missingFinancialData`
 *     rather than defaulting to zero, so Marcus reports the gap instead of
 *     reasoning from a fake balance sheet.
 *
 * Scoped to the caller's own profile/workspace. No ids, emails, keys or tokens.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const COST_KEYWORDS = [
  "cost",
  "price",
  "pricing",
  "subscription",
  "spend",
  "budget",
  "expensive",
  "refund",
  "invoice",
  "pay",
  "billing",
];

const PROJECT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  COMPLETED: "completed",
};

export async function buildMarcusContext(
  profileId: string,
  workspaceId: string,
  now: Date = new Date()
): Promise<MarcusContext> {
  const since = new Date(now.getTime() - SEVEN_DAYS_MS);
  const period = monthStart(now);

  const [
    snapshot,
    packet,
    briefing,
    focusSessions,
    contentItems,
    feedback,
    harper,
    renee,
    sophia,
    olivia,
  ] = await Promise.all([
    prisma.financialSnapshot.findUnique({
      where: { profileId_periodStart: { profileId, periodStart: period } },
    }),
    getWeeklyPacket(workspaceId, now),
    getDailyBriefing(workspaceId, now),
    prisma.focusSession.findMany({
      where: {
        profileId,
        status: "COMPLETED",
        endedAt: { gte: since, lte: now },
      },
      select: { durationMinutes: true },
    }),
    prisma.contentItem.findMany({
      where: { profileId },
      select: { title: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.feedback.findMany({
      where: { profileId, status: { in: ["NEW", "REVIEWING"] } },
      select: { type: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getLatestHarperAdvice(profileId),
    getLatestReneeAdvice(profileId),
    getLatestSophiaAdvice(profileId),
    getLatestOliviaAdvice(profileId),
  ]);

  const missingFinancialData: string[] = [];

  let financials: MarcusContext["financials"] = null;

  if (!snapshot) {
    missingFinancialData.push(
      "No financial snapshot has been entered for this month."
    );
  } else {
    const derived = deriveFinancials({
      currency: snapshot.currency,
      revenueCents: snapshot.revenueCents,
      operatingExpensesCents: snapshot.operatingExpensesCents,
      marketingSpendCents: snapshot.marketingSpendCents,
      availableCashCents: snapshot.availableCashCents,
      targetRevenueCents: snapshot.targetRevenueCents,
    });

    if (snapshot.revenueCents === 0) {
      missingFinancialData.push("Revenue for this month is recorded as zero.");
    }
    if (snapshot.availableCashCents === 0) {
      missingFinancialData.push("Available cash is recorded as zero.");
    }
    if (snapshot.targetRevenueCents === null) {
      missingFinancialData.push("No revenue target has been set.");
    }
    if (derived.runwayMonths === null) {
      missingFinancialData.push(
        derived.monthlyBurnCents === null
          ? "Runway is not applicable because the month is cash-flow positive."
          : "Runway cannot be calculated without available cash."
      );
    }

    const money = (cents: number) => formatCents(cents, snapshot.currency);

    financials = {
      period: formatPeriod(snapshot.periodStart),
      currency: snapshot.currency,
      revenue: money(snapshot.revenueCents),
      operatingExpenses: money(snapshot.operatingExpensesCents),
      marketingSpend: money(snapshot.marketingSpendCents),
      availableCash: money(snapshot.availableCashCents),
      targetRevenue:
        snapshot.targetRevenueCents !== null
          ? money(snapshot.targetRevenueCents)
          : null,
      netCashFlow: money(derived.netCashFlowCents),
      isCashFlowPositive: derived.netCashFlowCents >= 0,
      revenueGap:
        derived.revenueGapCents !== null
          ? money(Math.max(0, derived.revenueGapCents))
          : null,
      marketingPercentOfRevenue: derived.marketingPercentOfRevenue,
      monthlyBurn:
        derived.monthlyBurnCents !== null
          ? money(derived.monthlyBurnCents)
          : null,
      runwayMonths: derived.runwayMonths,
      notes: snapshot.notes,
    };
  }

  const countContent = (status: string) =>
    contentItems.filter((item) => item.status === status).length;

  const harperParsed = harper
    ? harperAnswerSchema.safeParse(harper.response)
    : null;
  const reneeParsed = renee
    ? reneeAnswerSchema.safeParse(renee.response)
    : null;
  const sophiaParsed = sophia
    ? sophiaAnswerSchema.safeParse(sophia.response)
    : null;
  const oliviaParsed = olivia
    ? oliviaAnswerSchema.safeParse(olivia.response)
    : null;

  return {
    generatedAt: now.toISOString(),
    financials,
    missingFinancialData,
    projects: packet.projects.map((project) => ({
      name: project.name,
      status: PROJECT_STATUS_LABELS[project.status] ?? "unknown",
      openTasks: project.openTasks,
      completedThisWeek: project.completedThisWeek,
    })),
    workload: {
      openTasks: packet.results.stillOpen,
      completedThisWeek: packet.results.completedThisWeek,
      overdueTasks: briefing.overdueCount,
    },
    focus: {
      sessionsLast7Days: focusSessions.length,
      minutesLast7Days: focusSessions.reduce(
        (total, session) => total + (session.durationMinutes ?? 0),
        0
      ),
    },
    content: {
      published: countContent("PUBLISHED"),
      scheduled: countContent("SCHEDULED"),
      inProgress:
        countContent("DRAFT") +
        countContent("READY") +
        countContent("UPLOADING") +
        countContent("PROCESSING"),
      recentTitles: contentItems.slice(0, 5).map((item) => item.title),
    },
    weeklyPacket: {
      weeklyPriority: packet.priorityTask?.title ?? null,
      risks: packet.risks.map((risk) => `${risk.title} — ${risk.detail}`),
    },
    latestHarperNextMove: harperParsed?.success
      ? harperParsed.data.nextMove
      : null,
    latestReneeStrategicPriority: reneeParsed?.success
      ? reneeParsed.data.strategicPriority
      : null,
    latestSophiaMarketingPriority: sophiaParsed?.success
      ? sophiaParsed.data.marketingPriority
      : null,
    latestOliviaOperationsPriority: oliviaParsed?.success
      ? oliviaParsed.data.operationsPriority
      : null,
    costRelatedFeedback: feedback
      .filter((entry) =>
        COST_KEYWORDS.some((keyword) =>
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

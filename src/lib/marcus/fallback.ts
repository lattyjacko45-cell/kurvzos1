import type { MarcusAnswer, MarcusContext } from "@/lib/marcus/types";

/**
 * Deterministic Marcus.
 *
 * Uses only entered figures and observed activity. Where a number is missing it
 * says so — it never substitutes a zero for an unknown, because "you earned
 * nothing" and "you told me nothing" are different statements.
 */

/** Marketing above this share of revenue is worth a second look. */
const HIGH_MARKETING_SHARE = 40;

/** Fewer months of runway than this is the point to act. */
const SHORT_RUNWAY_MONTHS = 3;

export function buildMarcusFallback(
  context: MarcusContext,
  question: string | null
): MarcusAnswer {
  const { financials, projects, content, workload } = context;

  const answer = question
    ? "I am running without a model connection, so this is my rule-based read of the figures you entered rather than a direct answer to your question."
    : null;

  // Nothing entered: the only honest priority is to enter something.
  if (!financials) {
    return {
      financialPriority: "Record this month's numbers",
      cashPosition:
        "I cannot assess cash because no financial snapshot has been entered for this month.",
      investmentRecommendation:
        "Enter revenue, operating expenses, marketing spend and available cash for this month. Until those exist, any financial recommendation would be guesswork.",
      costToWatch: null,
      revenueOpportunity:
        projects.length > 0
          ? `“${projects[0].name}” is your most active project and is the obvious place to look for revenue once the numbers are in.`
          : null,
      financialRisk:
        "Operating without a recorded cash position means problems surface late.",
      whyThisMatters:
        "Every figure I work from is one you type in. With none entered, there is nothing to protect or grow against.",
      answer,
    };
  }

  const leadProject = projects.find((project) => project.status === "active");
  const shortRunway =
    financials.runwayMonths !== null &&
    financials.runwayMonths < SHORT_RUNWAY_MONTHS;
  const highMarketing =
    financials.marketingPercentOfRevenue !== null &&
    financials.marketingPercentOfRevenue > HIGH_MARKETING_SHARE;

  // Priority follows the most binding constraint.
  let financialPriority: string;
  let investmentRecommendation: string;

  if (shortRunway) {
    financialPriority = "Extend runway";
    investmentRecommendation = `Hold spending flat and cut the largest non-essential cost this month. At ${financials.monthlyBurn} a month against ${financials.availableCash} on hand, protecting cash outranks any new investment.`;
  } else if (!financials.isCashFlowPositive) {
    financialPriority = "Return to positive cash flow";
    investmentRecommendation = `Close the gap between ${financials.revenue} in revenue and ${financials.operatingExpenses} in operating costs before committing to anything new.`;
  } else if (highMarketing) {
    financialPriority = "Check what marketing spend is buying";
    investmentRecommendation = `Marketing is ${financials.marketingPercentOfRevenue}% of revenue. Hold it at the current level for one more month and compare published output before increasing it.`;
  } else if (financials.revenueGap !== null && financials.revenueGap !== "0") {
    financialPriority = "Close the revenue gap";
    investmentRecommendation = `You are ${financials.revenueGap} short of target. Put the next unit of spend behind whatever most directly produces revenue rather than new overhead.`;
  } else {
    financialPriority = "Protect the current position";
    investmentRecommendation = `The month is cash-flow positive at ${financials.netCashFlow}. Set aside a portion of that surplus before increasing any recurring commitment.`;
  }

  const costToWatch = highMarketing
    ? `Marketing spend of ${financials.marketingSpend} is ${financials.marketingPercentOfRevenue}% of revenue.`
    : !financials.isCashFlowPositive
      ? `Operating expenses of ${financials.operatingExpenses} against ${financials.revenue} in revenue.`
      : context.costRelatedFeedback.length > 0
        ? "You have unresolved feedback mentioning cost or pricing — worth reviewing before it becomes a commitment."
        : null;

  const revenueOpportunity =
    content.published > 0
      ? `${content.published} published content ${content.published === 1 ? "item" : "items"} already exist — the cheapest revenue work is usually making existing output easier to buy from.`
      : content.scheduled > 0
        ? `${content.scheduled} scheduled ${content.scheduled === 1 ? "item" : "items"} will publish soon; decide now what action you want that audience to take.`
        : leadProject
          ? `“${leadProject.name}” carries the most active work and is the clearest candidate to turn into revenue.`
          : null;

  const financialRisk = shortRunway
    ? `At the current burn, available cash covers roughly ${financials.runwayMonths} months.`
    : !financials.isCashFlowPositive
      ? `The month is cash-flow negative at ${financials.netCashFlow}.`
      : workload.overdueTasks > 0
        ? `${workload.overdueTasks} overdue ${workload.overdueTasks === 1 ? "task" : "tasks"} may delay revenue-producing work.`
        : null;

  const whyThisMatters = [
    `Revenue ${financials.revenue}, operating costs ${financials.operatingExpenses}, marketing ${financials.marketingSpend}, net ${financials.netCashFlow}.`,
    `Cash on hand ${financials.availableCash}.`,
    context.missingFinancialData.length > 0
      ? `Not yet recorded: ${context.missingFinancialData[0]}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    financialPriority,
    cashPosition: financials.isCashFlowPositive
      ? `${financials.period} is cash-flow positive at ${financials.netCashFlow}, with ${financials.availableCash} available.`
      : `${financials.period} is cash-flow negative at ${financials.netCashFlow}, with ${financials.availableCash} available${financials.runwayMonths !== null ? ` — roughly ${financials.runwayMonths} months at the current burn` : ""}.`,
    investmentRecommendation,
    costToWatch,
    revenueOpportunity,
    financialRisk,
    whyThisMatters,
    answer,
  };
}

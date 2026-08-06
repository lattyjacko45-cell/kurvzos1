import { hasSpendingMandate } from "@/lib/marcus/safety";
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

  // Without a stated budget or reserve we cannot know what is safe to spend,
  // so no recommendation may name an amount.
  const mandated = hasSpendingMandate(context);

  // Unpublished or unscheduled work means the constraint is execution, not
  // funding — and finishing it costs nothing.
  const unfinishedContent = content.inProgress > 0;

  let financialPriority: string;
  let investmentRecommendation: string;

  if (shortRunway) {
    financialPriority = "Extend runway";
    investmentRecommendation = `Hold spending flat and cut the largest non-essential cost this month. With ${financials.monthlyBurn} a month going out, protecting the cash balance outranks any new commitment.`;
  } else if (!financials.isCashFlowPositive) {
    financialPriority = "Return to positive cash flow";
    investmentRecommendation = `Close the gap between ${financials.revenue} in revenue and ${financials.operatingExpenses} in operating costs before committing to anything new.`;
  } else if (unfinishedContent) {
    // The example case: money is not the bottleneck, unfinished work is.
    financialPriority = "Finish what is already built before spending";
    investmentRecommendation = `Protect the ${financials.availableCash} cash balance. Complete and publish the ${content.inProgress === 1 ? "content item" : `${content.inProgress} content items`} already in progress before committing any promotion spend, then evaluate whether a small test budget is justified.`;
  } else if (highMarketing) {
    financialPriority = "Check what marketing spend is buying";
    investmentRecommendation = `Marketing is ${financials.marketingPercentOfRevenue}% of revenue. Hold it at the current level for one more month and compare it against what actually published before changing it.`;
  } else if (financials.revenueGap !== null) {
    financialPriority = "Work the revenue gap without new spend";
    investmentRecommendation = mandated
      ? `You are ${financials.revenueGap} short of target. Keep any spend inside the budget you set, and put it behind work that already exists rather than new overhead.`
      : `You are ${financials.revenueGap} short of target. Set a spending budget or a minimum cash reserve first — until then the safe amount to invest cannot be determined, so prefer no-cost execution.`;
  } else {
    financialPriority = "Protect the current position";
    investmentRecommendation = `The month is cash-flow positive at ${financials.netCashFlow}. Hold the surplus rather than adding a recurring commitment against it.`;
  }

  const costToWatch = highMarketing
    ? `Marketing spend of ${financials.marketingSpend} is ${financials.marketingPercentOfRevenue}% of revenue.`
    : !financials.isCashFlowPositive
      ? `Operating expenses of ${financials.operatingExpenses} against ${financials.revenue} in revenue.`
      : context.costRelatedFeedback.length > 0
        ? "You have unresolved feedback mentioning cost or pricing — worth reviewing before it becomes a commitment."
        : null;

  // Grounded phrasing only: KurvzOS has no attribution or conversion data, so
  // nothing here may promise that content produces revenue.
  const revenueOpportunity =
    content.published > 0
      ? `${content.published} published content ${content.published === 1 ? "item" : "items"} already exist — making them easier to act on creates an asset that could later support revenue, at no additional cost.`
      : content.scheduled > 0
        ? `${content.scheduled} scheduled ${content.scheduled === 1 ? "item" : "items"} will publish soon. Deciding now what action you want from that audience tests whether this content contributes to the revenue goal.`
        : leadProject
          ? `“${leadProject.name}” carries the most active work, so it is the clearest place to test whether current effort contributes to the revenue goal.`
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

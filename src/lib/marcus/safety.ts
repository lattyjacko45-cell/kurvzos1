/**
 * Financial safety guardrails for Marcus.
 *
 * Two failures matter more than any other in a CFO persona:
 *   1. Treating the available-cash balance as spendable. It is not — KurvzOS
 *      does not know what portion is discretionary, what reserve the user needs,
 *      or what tax and commitments are owed against it.
 *   2. Implying that publishing content produces revenue. KurvzOS holds no
 *      revenue attribution, no conversion data and no traffic data, so any such
 *      claim is invented.
 *
 * The prompt forbids both. This module assumes the prompt will sometimes fail
 * and rejects the output when it does. Pure and dependency-free.
 */

import type { MarcusAnswer, MarcusContext } from "@/lib/marcus/types";

export type SafetyViolation =
  | "full-cash-spend"
  | "unsupported-amount"
  | "unevidenced-revenue-claim";

/** Verbs that turn a figure into a spending instruction. */
const SPEND_VERBS =
  "spend|invest|allocate|commit|deploy|put|use|budget|fund|pour|channel";

/** Phrases that treat the whole balance as available to spend. */
const FULL_BALANCE_PATTERNS: RegExp[] = [
  /\ball (?:of )?(?:the |your )?(?:available )?cash\b/i,
  /\bentire (?:cash )?(?:balance|reserve|amount|sum)\b/i,
  /\bfull (?:cash )?(?:balance|amount|reserve)\b/i,
  /\bwhole (?:cash )?(?:balance|amount)\b/i,
  /\bevery (?:last )?(?:dollar|penny)\b/i,
];

/**
 * Claims that content or activity will produce revenue. KurvzOS cannot support
 * any of these — there is no attribution data in the product.
 */
const REVENUE_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:will|should|is likely to|expected to|going to)\s+(?:\w+\s+){0,3}?(?:generate|drive|produce|bring in|deliver|convert|earn|yield|return)\b/i,
  /\blikely to (?:convert|monetiz|generat|driv)/i,
  /\bfastest (?:path|way|route) to (?:close|closing|hit|hitting|reach|reaching) (?:the )?revenue\b/i,
  /\bwill (?:pay for itself|recoup|break even)\b/i,
  /\b(?:guaranteed|assured|certain) (?:revenue|return|income|sales)\b/i,
  /\b(?:high|strong|good) (?:roi|return on investment)\b/i,
  /\bconversion rate\b/i,
  /\bexpected (?:revenue|return|roi|sales)\b/i,
];

/** Grounded replacements for the most common unsupported phrasings. */
const GROUNDED_REWRITES: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\bwill convert to revenue\b/gi,
    replacement: "creates an asset that could later support revenue",
  },
  {
    pattern: /\b(?:is )?likely to (?:drive|generate) revenue\b/gi,
    replacement: "tests whether this content contributes to the revenue goal",
  },
  {
    pattern:
      /\bfastest (?:path|way|route) to (?:close|closing) the revenue gap\b/gi,
    replacement:
      "one way to test whether this work contributes to the revenue goal",
  },
  {
    pattern: /\bwill (?:generate|produce|bring in) revenue\b/gi,
    replacement: "creates an asset that could later support revenue",
  },
  {
    pattern: /\bwill pay for itself\b/gi,
    replacement: "may or may not return its cost — there is no data either way",
  },
];

/**
 * A spending mandate the user has stated for themselves.
 *
 * There is no dedicated column for this yet and this sprint does not change the
 * schema, so it is read from the snapshot notes in a deliberately strict form:
 *   "budget: 500"   "reserve: 5,000"   "budget = $250.00"
 * Anything looser is ignored — a vague note must not unlock a dollar figure.
 */
export interface SpendingMandate {
  budgetCents: number | null;
  minimumReserveCents: number | null;
}

export function parseSpendingMandate(
  notes: string | null | undefined
): SpendingMandate | null {
  if (!notes) return null;

  const read = (label: string): number | null => {
    const match = notes.match(
      new RegExp(`\\b${label}\\s*[:=]\\s*\\$?\\s*([\\d,]+(?:\\.\\d{1,2})?)`, "i")
    );
    if (!match) return null;

    const value = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  };

  const budgetCents = read("budget");
  const minimumReserveCents = read("reserve") ?? read("minimum reserve");

  if (budgetCents === null && minimumReserveCents === null) return null;

  return { budgetCents, minimumReserveCents };
}

/** True when the user has told us what is safe to spend or hold back. */
export function hasSpendingMandate(context: MarcusContext): boolean {
  const mandate = context.spendingMandate;
  return Boolean(
    mandate && (mandate.budgetCents !== null || mandate.minimumReserveCents !== null)
  );
}

/** Currency amounts appearing in text, normalised to cents. */
function amountsInCents(text: string): number[] {
  const matches = text.match(/\$\s?[\d,]+(?:\.\d{1,2})?/g) ?? [];

  return matches
    .map((raw) => Number(raw.replace(/[$,\s]/g, "")))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value * 100));
}

/** Figures Marcus is allowed to quote, because we computed them. */
function knownAmounts(context: MarcusContext): Set<number> {
  const known = new Set<number>();
  const financials = context.financials;
  if (!financials) return known;

  for (const value of [
    financials.revenue,
    financials.operatingExpenses,
    financials.marketingSpend,
    financials.availableCash,
    financials.targetRevenue,
    financials.netCashFlow,
    financials.revenueGap,
    financials.monthlyBurn,
  ]) {
    if (!value) continue;
    for (const cents of amountsInCents(value)) known.add(cents);
  }

  return known;
}

/** Text fields that carry a recommendation rather than a description. */
function recommendationText(advice: MarcusAnswer): string {
  return [advice.investmentRecommendation, advice.answer ?? ""].join(" ");
}

function allText(advice: MarcusAnswer): string {
  return [
    advice.financialPriority,
    advice.cashPosition,
    advice.investmentRecommendation,
    advice.costToWatch ?? "",
    advice.revenueOpportunity ?? "",
    advice.financialRisk ?? "",
    advice.whyThisMatters,
    advice.answer ?? "",
  ].join(" ");
}

/**
 * Inspects a response for the three unsafe patterns. Returns every violation
 * found so the log can say which rule tripped.
 */
export function findFinancialSafetyViolations(
  advice: MarcusAnswer,
  context: MarcusContext
): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  const recommendation = recommendationText(advice);
  const everything = allText(advice);

  // 1. Spending the whole balance, however it is phrased.
  const spendsFullBalance = FULL_BALANCE_PATTERNS.some((pattern) =>
    pattern.test(recommendation)
  );

  const cashCents = context.financials
    ? amountsInCents(context.financials.availableCash)[0]
    : undefined;

  // "invest the $10,000" — a spend verb within reach of the cash figure.
  const spendsCashFigure =
    cashCents !== undefined &&
    new RegExp(
      `\\b(?:${SPEND_VERBS})\\b[^.]{0,60}?\\$\\s?${(cashCents / 100)
        .toLocaleString("en-US")
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i"
    ).test(recommendation);

  if (spendsFullBalance || spendsCashFigure) {
    violations.push("full-cash-spend");
  }

  // 2. A dollar figure we never computed, offered without a mandate.
  if (!hasSpendingMandate(context)) {
    const allowed = knownAmounts(context);
    const quoted = amountsInCents(recommendation);

    if (quoted.some((amount) => !allowed.has(amount))) {
      violations.push("unsupported-amount");
    }
  }

  // 3. Revenue claims with nothing behind them.
  if (REVENUE_CLAIM_PATTERNS.some((pattern) => pattern.test(everything))) {
    violations.push("unevidenced-revenue-claim");
  }

  return violations;
}

/**
 * Softens unsupported revenue phrasing in text that is otherwise safe.
 * Used on stored responses so rows written before these rules existed read
 * correctly today.
 */
export function groundFinancialLanguage(text: string): string {
  let output = text;

  for (const { pattern, replacement } of GROUNDED_REWRITES) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

export function groundAdviceLanguage(advice: MarcusAnswer): MarcusAnswer {
  const clean = (value: string | null | undefined) =>
    typeof value === "string" ? groundFinancialLanguage(value) : value;

  return {
    ...advice,
    financialPriority: groundFinancialLanguage(advice.financialPriority),
    cashPosition: groundFinancialLanguage(advice.cashPosition),
    investmentRecommendation: groundFinancialLanguage(
      advice.investmentRecommendation
    ),
    costToWatch: clean(advice.costToWatch),
    revenueOpportunity: clean(advice.revenueOpportunity),
    financialRisk: clean(advice.financialRisk),
    whyThisMatters: groundFinancialLanguage(advice.whyThisMatters),
    answer: clean(advice.answer),
  };
}

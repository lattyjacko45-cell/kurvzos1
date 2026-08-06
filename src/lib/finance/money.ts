/**
 * Money handling and the four financial derivations Marcus is allowed to make.
 *
 * Everything is integer cents. Nothing here estimates, projects or extrapolates
 * — each function either has the inputs to answer honestly or returns null so
 * the caller can say what is missing.
 */

export const DEFAULT_CURRENCY = "USD";

/** Guards against overflow and typos; 1 trillion cents is far beyond scope. */
export const MAX_MONEY_CENTS = 1_000_000_000_000;

export interface SnapshotFigures {
  currency: string;
  revenueCents: number;
  operatingExpensesCents: number;
  marketingSpendCents: number;
  availableCashCents: number;
  targetRevenueCents: number | null;
}

export interface FinancialDerivations {
  /** Revenue minus operating expenses minus marketing spend. */
  netCashFlowCents: number;
  /** Positive means still short of target. Null when no target is set. */
  revenueGapCents: number | null;
  /** Null when revenue is zero — a percentage of nothing is meaningless. */
  marketingPercentOfRevenue: number | null;
  /** Only when the business is burning cash and has cash to burn. */
  runwayMonths: number | null;
  /** Monthly burn when negative cash flow, else null. */
  monthlyBurnCents: number | null;
}

/** Parses "1,234.56" into 123456 cents. Returns null when unparseable. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "").replace(/^\$/, "");
  if (cleaned === "") return 0;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    // Unknown currency code: fall back to a plain number plus the code.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function isValidMoneyCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_MONEY_CENTS
  );
}

export function isValidCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/** First day of the month containing `date`, at UTC midnight. */
export function monthStart(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
  );
}

export function formatPeriod(periodStart: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(periodStart);
}

export function deriveFinancials(
  figures: SnapshotFigures
): FinancialDerivations {
  const netCashFlowCents =
    figures.revenueCents -
    figures.operatingExpensesCents -
    figures.marketingSpendCents;

  const monthlyBurnCents = netCashFlowCents < 0 ? -netCashFlowCents : null;

  return {
    netCashFlowCents,
    revenueGapCents:
      figures.targetRevenueCents !== null
        ? figures.targetRevenueCents - figures.revenueCents
        : null,
    marketingPercentOfRevenue:
      figures.revenueCents > 0
        ? Math.round(
            (figures.marketingSpendCents / figures.revenueCents) * 1000
          ) / 10
        : null,
    // Runway is only honest with both a burn rate and cash on hand.
    runwayMonths:
      monthlyBurnCents !== null && figures.availableCashCents > 0
        ? Math.round((figures.availableCashCents / monthlyBurnCents) * 10) / 10
        : null,
    monthlyBurnCents,
  };
}

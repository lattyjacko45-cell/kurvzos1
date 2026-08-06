import { z } from "zod";

/**
 * Marcus's contract — Chief Financial Officer.
 *
 * The other four read work. Marcus reads money: the manually entered snapshot
 * plus whatever the workspace says about where effort is going. He answers
 * "where should the business spend, save, or earn next?"
 */

export const marcusAdviceSchema = z.object({
  /** One financial outcome needing attention. */
  financialPriority: z.string().trim().min(1).max(200),
  /** Plain-language read of cash, based only on entered figures. */
  cashPosition: z.string().trim().min(1).max(400),
  /** Exactly one recommended use or protection of money. */
  investmentRecommendation: z.string().trim().min(1).max(400),
  /** One expense or commitment to monitor. Null when no evidence exists. */
  costToWatch: z.string().trim().max(300).nullish(),
  /** One realistic opportunity grounded in current work. */
  revenueOpportunity: z.string().trim().max(300).nullish(),
  /** One financial risk. Null when none exists. */
  financialRisk: z.string().trim().max(300).nullish(),
  whyThisMatters: z.string().trim().min(1).max(400),
});

export type MarcusAdvice = z.infer<typeof marcusAdviceSchema>;

export const marcusAnswerSchema = marcusAdviceSchema.extend({
  answer: z.string().trim().min(1).max(1200).nullish(),
});

export type MarcusAnswer = z.infer<typeof marcusAnswerSchema>;

/** Provider-enforced shape. Mirrors marcusAnswerSchema. */
export const MARCUS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    financialPriority: { type: "string" },
    cashPosition: { type: "string" },
    investmentRecommendation: { type: "string" },
    costToWatch: { type: ["string", "null"] },
    revenueOpportunity: { type: ["string", "null"] },
    financialRisk: { type: ["string", "null"] },
    whyThisMatters: { type: "string" },
    answer: { type: ["string", "null"] },
  },
  required: [
    "financialPriority",
    "cashPosition",
    "investmentRecommendation",
    "costToWatch",
    "revenueOpportunity",
    "financialRisk",
    "whyThisMatters",
    "answer",
  ],
} as const satisfies Record<string, unknown>;

export type MarcusSource = "AI" | "FALLBACK";

export interface MarcusResult {
  advice: MarcusAnswer;
  source: MarcusSource;
  fallbackReason?: string;
}

/**
 * Exactly what Marcus is allowed to see.
 *
 * Money is pre-formatted as display strings so the model never has to do
 * arithmetic — every number it sees was computed deterministically. Excluded:
 * ids, emails, keys, tokens, account credentials.
 */
export interface MarcusContext {
  generatedAt: string;
  /** Null when the user has not entered figures for the current month. */
  financials: {
    period: string;
    currency: string;
    revenue: string;
    operatingExpenses: string;
    marketingSpend: string;
    availableCash: string;
    targetRevenue: string | null;
    netCashFlow: string;
    isCashFlowPositive: boolean;
    revenueGap: string | null;
    marketingPercentOfRevenue: number | null;
    monthlyBurn: string | null;
    runwayMonths: number | null;
    notes: string | null;
  } | null;
  /** Named explicitly so Marcus can say what is missing rather than guess. */
  missingFinancialData: string[];
  projects: Array<{
    name: string;
    status: string;
    openTasks: number;
    completedThisWeek: number;
  }>;
  workload: {
    openTasks: number;
    completedThisWeek: number;
    overdueTasks: number;
  };
  focus: {
    sessionsLast7Days: number;
    minutesLast7Days: number;
  };
  content: {
    published: number;
    scheduled: number;
    inProgress: number;
    recentTitles: string[];
  };
  weeklyPacket: {
    weeklyPriority: string | null;
    risks: string[];
  };
  latestHarperNextMove: string | null;
  latestReneeStrategicPriority: string | null;
  latestSophiaMarketingPriority: string | null;
  latestOliviaOperationsPriority: string | null;
  costRelatedFeedback: Array<{ type: string; description: string }>;
}

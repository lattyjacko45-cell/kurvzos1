import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_MONEY_CENTS,
  isValidCurrencyCode,
  monthStart,
} from "@/lib/finance/money";

/**
 * Manual monthly financial snapshot.
 *
 * Money arrives as integer cents and is re-validated here — a client that sends
 * a float, a negative, or an absurd value is rejected. Snapshots are keyed on
 * (profile, period), so a profile can only ever read or write its own.
 */

const moneyCents = z.number().int().min(0).max(MAX_MONEY_CENTS);

const upsertSchema = z.object({
  currency: z.string().trim().toUpperCase().length(3),
  revenueCents: moneyCents,
  operatingExpensesCents: moneyCents,
  marketingSpendCents: moneyCents,
  availableCashCents: moneyCents,
  targetRevenueCents: moneyCents.nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

async function requireProfileId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  return profile.id;
}

/** GET — the current month's snapshot for this profile, or null. */
export async function GET() {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await prisma.financialSnapshot.findUnique({
    where: {
      profileId_periodStart: { profileId, periodStart: monthStart() },
    },
  });

  return NextResponse.json(snapshot);
}

/** PUT — create or update the current month's snapshot. */
export async function PUT(request: Request) {
  const profileId = await requireProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = upsertSchema.parse(await request.json());

    if (!isValidCurrencyCode(data.currency)) {
      return NextResponse.json(
        { error: "Currency must be a three-letter code such as USD." },
        { status: 400 }
      );
    }

    // The period is derived server-side; a client cannot backdate a snapshot.
    const periodStart = monthStart();

    const snapshot = await prisma.financialSnapshot.upsert({
      where: { profileId_periodStart: { profileId, periodStart } },
      update: {
        currency: data.currency,
        revenueCents: data.revenueCents,
        operatingExpensesCents: data.operatingExpensesCents,
        marketingSpendCents: data.marketingSpendCents,
        availableCashCents: data.availableCashCents,
        targetRevenueCents: data.targetRevenueCents ?? null,
        notes: data.notes ?? null,
      },
      create: {
        profileId,
        periodStart,
        currency: data.currency,
        revenueCents: data.revenueCents,
        operatingExpensesCents: data.operatingExpensesCents,
        marketingSpendCents: data.marketingSpendCents,
        availableCashCents: data.availableCashCents,
        targetRevenueCents: data.targetRevenueCents ?? null,
        notes: data.notes ?? null,
      },
    });

    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Field path only — never the submitted value.
      return NextResponse.json(
        {
          error: "Please check the amounts entered.",
          field: err.issues[0].path.join("."),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not save the financial snapshot." },
      { status: 500 }
    );
  }
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_CURRENCY,
  centsToInput,
  parseMoneyToCents,
} from "@/lib/finance/money";
import { useExecutiveAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";

export interface SnapshotFormValues {
  currency: string;
  revenueCents: number;
  operatingExpensesCents: number;
  marketingSpendCents: number;
  availableCashCents: number;
  targetRevenueCents: number | null;
  notes: string | null;
}

interface FinancialSnapshotFormProps {
  period: string;
  initial: SnapshotFormValues | null;
}

type FieldKey =
  | "revenue"
  | "operatingExpenses"
  | "marketingSpend"
  | "availableCash"
  | "targetRevenue";

const FIELD_LABELS: Record<FieldKey, string> = {
  revenue: "Revenue this month",
  operatingExpenses: "Operating expenses",
  marketingSpend: "Marketing spend",
  availableCash: "Available cash",
  targetRevenue: "Revenue target (optional)",
};

export function FinancialSnapshotForm({
  period,
  initial,
}: FinancialSnapshotFormProps) {
  const router = useRouter();
  const scheduleExecutiveRefresh = useExecutiveAutoRefresh();

  const [currency, setCurrency] = useState(
    initial?.currency ?? DEFAULT_CURRENCY
  );
  const [values, setValues] = useState<Record<FieldKey, string>>({
    revenue: centsToInput(initial?.revenueCents ?? 0),
    operatingExpenses: centsToInput(initial?.operatingExpensesCents ?? 0),
    marketingSpend: centsToInput(initial?.marketingSpendCents ?? 0),
    availableCash: centsToInput(initial?.availableCashCents ?? 0),
    targetRevenue: centsToInput(initial?.targetRevenueCents ?? null),
  });
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  function setField(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSaving) return;

    // Parse to integer cents in the browser; the server re-validates.
    const parsed: Partial<Record<FieldKey, number | null>> = {};
    const nextErrors: Partial<Record<FieldKey, string>> = {};

    for (const key of Object.keys(FIELD_LABELS) as FieldKey[]) {
      const raw = values[key].trim();

      if (key === "targetRevenue" && raw === "") {
        parsed[key] = null;
        continue;
      }

      const cents = parseMoneyToCents(raw);

      if (cents === null || cents < 0) {
        nextErrors[key] = "Enter an amount like 1250.00.";
      } else {
        parsed[key] = cents;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      const response = await fetch("/api/financial-snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: currency.trim().toUpperCase(),
          revenueCents: parsed.revenue ?? 0,
          operatingExpensesCents: parsed.operatingExpenses ?? 0,
          marketingSpendCents: parsed.marketingSpend ?? 0,
          availableCashCents: parsed.availableCash ?? 0,
          targetRevenueCents: parsed.targetRevenue ?? null,
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not save the snapshot.");
      }

      toast.success("Financial snapshot saved");
      // Changed figures are Marcus's main significance trigger.
      scheduleExecutiveRefresh();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the snapshot."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border p-6"
      noValidate
    >
      <div className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Financial snapshot
        </h2>

        <p className="text-sm text-muted-foreground">
          {period} · entered by you. Nothing is imported from a bank or payment
          processor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`snapshot-${key}`}>{FIELD_LABELS[key]}</Label>

            <Input
              id={`snapshot-${key}`}
              inputMode="decimal"
              value={values[key]}
              onChange={(event) => setField(key, event.target.value)}
              placeholder="0.00"
              disabled={isSaving}
              aria-invalid={Boolean(errors[key])}
              aria-describedby={errors[key] ? `${key}-error` : undefined}
            />

            {errors[key] ? (
              <p id={`${key}-error`} className="text-sm text-destructive">
                {errors[key]}
              </p>
            ) : null}
          </div>
        ))}

        <div className="space-y-2">
          <Label htmlFor="snapshot-currency">Currency</Label>
          <Input
            id="snapshot-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            maxLength={3}
            placeholder="USD"
            disabled={isSaving}
            className="uppercase"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="snapshot-notes">Notes (optional)</Label>
        <textarea
          id="snapshot-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={1000}
          disabled={isSaving}
          placeholder="Anything Marcus should know about this month."
          className="border-input bg-background w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
      </div>

      <Button type="submit" disabled={isSaving}>
        {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
        Save snapshot
      </Button>
    </form>
  );
}

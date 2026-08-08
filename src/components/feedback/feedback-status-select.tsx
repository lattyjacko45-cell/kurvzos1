"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const FEEDBACK_STATUS_LABELS = {
  NEW: "New",
  REVIEWING: "Reviewing",
  FIXED: "Fixed",
  DISMISSED: "Dismissed",
} as const;

export type FeedbackStatusValue = keyof typeof FEEDBACK_STATUS_LABELS;

interface FeedbackStatusSelectProps {
  feedbackId: string;
  status: FeedbackStatusValue;
}

export function FeedbackStatusSelect({
  feedbackId,
  status,
}: FeedbackStatusSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState<FeedbackStatusValue>(status);
  const [isSaving, setIsSaving] = useState(false);

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as FeedbackStatusValue;
    const previous = value;

    if (next === previous) return;

    setValue(next);
    setIsSaving(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, status: next }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      toast.success("Status updated");
      router.refresh();
    } catch (error) {
      setValue(previous);
      toast.error(
        error instanceof Error ? error.message : "Failed to update status"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={isSaving}
      aria-label="Feedback status"
      className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {Object.entries(FEEDBACK_STATUS_LABELS).map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

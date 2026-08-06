"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useHarperAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

interface TaskStatusSelectProps {
  taskId: string;
  status: TaskStatus;
}

const STATUS_OPTIONS: ReadonlyArray<{ value: TaskStatus; label: string }> = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "DONE", label: "Done" },
];

export function TaskStatusSelect({ taskId, status }: TaskStatusSelectProps) {
  const router = useRouter();
  const scheduleHarperRefresh = useHarperAutoRefresh();
  const [value, setValue] = useState<TaskStatus>(status);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextStatus = event.target.value as TaskStatus;
    const previousStatus = value;

    if (nextStatus === previousStatus) return;

    setValue(nextStatus);
    setIsSaving(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      toast.success(
        nextStatus === "DONE"
          ? "Task completed and moved to Completed Work."
          : "Task status updated"
      );

      // A status change always shifts the mission picture.
      scheduleHarperRefresh();

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setValue(previousStatus);
      toast.error(
        error instanceof Error ? error.message : "Failed to update task status",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={isSaving || isPending}
      aria-label="Task status"
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

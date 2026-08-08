"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon, RotateCcwIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHarperAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";

export interface CompletedTaskRowData {
  id: string;
  title: string;
  projectName: string;
  priority: string;
  completedSteps: number;
  totalSteps: number;
  /** Best available signal: the task's last update. */
  completedAt: string;
  steps: Array<{ id: string; title: string; completed: boolean }>;
}

const PRIORITY_VARIANTS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "outline",
  URGENT: "destructive",
};

export function CompletedTaskRow({ task }: { task: CompletedTaskRowData }) {
  const router = useRouter();
  const scheduleHarperRefresh = useHarperAutoRefresh();
  const [isOpen, setIsOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

  /** Reopening returns the task to TODO so it can win mission selection again. */
  async function reopen() {
    if (isReopening) return;
    setIsReopening(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: "TODO" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not reopen the task");
      }

      toast.success("Task reopened and moved back to Active.");
      scheduleHarperRefresh();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reopen the task"
      );
    } finally {
      setIsReopening(false);
    }
  }

  const detailsId = `completed-details-${task.id}`;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">{task.title}</p>

            <p className="text-sm text-muted-foreground">
              {task.projectName} · {task.completedSteps}/{task.totalSteps} steps
              · completed{" "}
              {new Date(task.completedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={PRIORITY_VARIANTS[task.priority] ?? "secondary"}>
              {task.priority.toLowerCase()}
            </Badge>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-expanded={isOpen}
              aria-controls={detailsId}
              onClick={() => setIsOpen((open) => !open)}
            >
              <ChevronDownIcon
                className={isOpen ? "rotate-180 transition-transform" : "transition-transform"}
              />
              View details
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={reopen}
              disabled={isReopening}
            >
              <RotateCcwIcon />
              Reopen task
            </Button>
          </div>
        </div>

        {isOpen ? (
          <div id={detailsId} className="rounded-2xl border p-4">
            {task.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This task had no checklist.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {task.steps.map((step) => (
                  <li key={step.id} className="flex items-center gap-2">
                    <span aria-hidden="true">{step.completed ? "✓" : "○"}</span>

                    <span
                      className={
                        step.completed ? "text-muted-foreground line-through" : ""
                      }
                    >
                      {step.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

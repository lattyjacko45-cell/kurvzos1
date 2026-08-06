"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClapperboardIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import type { Priority, TaskStatus } from "@/generated/prisma/client";
import { TaskStatusSelect } from "@/components/dashboard/task-status-select";
import { DailyGreeting } from "@/components/dashboard/daily-greeting";
import { CreateTaskDialog } from "@/components/dashboard/create-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  deriveMissionProgress,
  harperRecommendation,
  type MissionStep,
} from "@/lib/mission";
import { ESTIMATED_FOCUS_MINUTES } from "@/lib/focus";
import { useDeferredRefresh } from "@/lib/use-deferred-refresh";
import { useHarperAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";

export type { MissionStep };

export interface Mission {
  id: string;
  title: string;
  projectName: string;
  status: TaskStatus;
  priority: Priority;
}

interface MissionSectionProps {
  /**
   * The actionable mission chosen by the Daily Briefing selector, or null when
   * nothing is actionable. Never a DONE task.
   */
  mission: Mission | null;
  initialSteps: MissionStep[];
  firstName: string | null;
  /** Server-computed greeting; DailyGreeting corrects it to local time. */
  greeting: string;
  /** Projects available to the inline "Create Task" dialog. */
  projects: Array<{ id: string; name: string }>;
  /**
   * Latest saved Harper advice. Read from the database — the dashboard never
   * triggers a model call on render.
   */
  harper: { currentPriority: string; nextMove: string } | null;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_VARIANTS: Record<
  Priority,
  "outline" | "secondary" | "default" | "destructive"
> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  URGENT: "destructive",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const OPTIMISTIC_PREFIX = "optimistic-";

/** True while a newly added step is still waiting for its real id. */
function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/** Cheap value-equality key for a checklist. */
function stepsSignature(steps: MissionStep[]): string {
  return steps
    .map(
      (step) =>
        `${step.id}:${step.position}:${step.completed ? 1 : 0}:${step.title}`
    )
    .join("|");
}

async function requestJson(
  input: string,
  init: RequestInit
): Promise<unknown> {
  const response = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return response.json();
}

export function MissionSection({
  mission,
  initialSteps,
  firstName,
  greeting,
  projects,
  harper,
}: MissionSectionProps) {
  const router = useRouter();
  const scheduleRefresh = useDeferredRefresh();
  const scheduleHarperRefresh = useHarperAutoRefresh();
  const [steps, setSteps] = useState<MissionStep[]>(initialSteps);
  /** Only gates the add-step submit; never blocks the checklist itself. */
  const [isSubmittingStep, setIsSubmittingStep] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Adopt server data only when it actually changed. A refresh that returns
  // what we already have must not stomp on newer optimistic state.
  const lastServerSignature = useRef(stepsSignature(initialSteps));

  useEffect(() => {
    const signature = stepsSignature(initialSteps);
    if (signature === lastServerSignature.current) return;

    lastServerSignature.current = signature;
    setSteps(initialSteps);
  }, [initialSteps]);

  const progress = useMemo(() => deriveMissionProgress(steps), [steps]);
  const { completedCount, currentStep, nextStep } = progress;
  const progressPercent = progress.percent;

  async function toggleStep(step: MissionStep) {
    if (isOptimisticId(step.id)) return;

    const previous = steps;
    const nextCompleted = !step.completed;

    setSteps((current) =>
      current.map((item) =>
        item.id === step.id ? { ...item, completed: nextCompleted } : item
      )
    );

    try {
      await requestJson("/api/task-steps", {
        method: "PATCH",
        body: JSON.stringify({ stepId: step.id, completed: nextCompleted }),
      });
      scheduleRefresh();

      // The server decides whether this is worth a model call — finishing the
      // last step is, ticking step 2 of 7 is not.
      scheduleHarperRefresh();
    } catch (error) {
      setSteps(previous);
      toast.error(errorMessage(error, "Failed to update step"));
    }
  }

  async function addStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mission) return;

    const title = newTitle.trim();
    if (!title || isSubmittingStep) return;

    // Optimistic row with a placeholder id, swapped for the real one on save.
    const optimisticId = `${OPTIMISTIC_PREFIX}${Date.now()}`;
    const previous = steps;

    setSteps((current) => [
      ...current,
      {
        id: optimisticId,
        title,
        completed: false,
        position: current.length,
      },
    ]);
    setNewTitle("");
    setIsAdding(false);
    setIsSubmittingStep(true);

    try {
      const created = (await requestJson("/api/task-steps", {
        method: "POST",
        body: JSON.stringify({ taskId: mission.id, title }),
      })) as MissionStep;

      setSteps((current) =>
        current.map((item) => (item.id === optimisticId ? created : item))
      );
      scheduleRefresh();
    } catch (error) {
      setSteps(previous);
      toast.error(errorMessage(error, "Failed to add step"));
    } finally {
      setIsSubmittingStep(false);
    }
  }

  async function saveTitle(step: MissionStep) {
    if (isOptimisticId(step.id)) {
      setEditingId(null);
      return;
    }

    const title = editingTitle.trim();

    if (!title || title === step.title) {
      setEditingId(null);
      return;
    }

    const previous = steps;
    setSteps((current) =>
      current.map((item) => (item.id === step.id ? { ...item, title } : item))
    );
    setEditingId(null);

    try {
      await requestJson("/api/task-steps", {
        method: "PATCH",
        body: JSON.stringify({ stepId: step.id, title }),
      });
      scheduleRefresh();
    } catch (error) {
      setSteps(previous);
      toast.error(errorMessage(error, "Failed to rename step"));
    }
  }

  async function deleteStep(step: MissionStep) {
    if (isOptimisticId(step.id)) return;

    const previous = steps;

    setSteps((current) =>
      current
        .filter((item) => item.id !== step.id)
        .map((item, index) => ({ ...item, position: index }))
    );

    try {
      await requestJson("/api/task-steps", {
        method: "DELETE",
        body: JSON.stringify({ stepId: step.id }),
      });
      scheduleRefresh();
    } catch (error) {
      setSteps(previous);
      toast.error(errorMessage(error, "Failed to delete step"));
    }
  }

  async function moveStep(index: number, direction: -1 | 1) {
    if (!mission) return;

    const target = index + direction;
    if (target < 0 || target >= steps.length) return;

    // A pending row has no server id yet, so the reorder payload would be
    // rejected. Wait for it to land.
    if (steps.some((step) => isOptimisticId(step.id))) return;

    const previous = steps;
    const reordered = [...steps];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    setSteps(reordered.map((step, position) => ({ ...step, position })));

    try {
      await requestJson("/api/task-steps/reorder", {
        method: "POST",
        body: JSON.stringify({
          taskId: mission.id,
          orderedIds: reordered.map((step) => step.id),
        }),
      });
      scheduleRefresh();
    } catch (error) {
      setSteps(previous);
      toast.error(errorMessage(error, "Failed to reorder steps"));
    }
  }

  const addStepForm = (
    <form onSubmit={addStep} className="flex items-center gap-2">
      <Input
        autoFocus
        value={newTitle}
        onChange={(event) => setNewTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsAdding(false);
            setNewTitle("");
          }
        }}
        placeholder="Describe the step"
        maxLength={200}
        className="h-9"
      />

      <Button
        type="submit"
        size="sm"
        disabled={isSubmittingStep || !newTitle.trim()}
      >
        Save
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setIsAdding(false);
          setNewTitle("");
        }}
      >
        Cancel
      </Button>
    </form>
  );

  return (
    <>
      <Card className="rounded-3xl shadow-sm">
        <CardContent className="p-8">
          {mission ? (
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Today&apos;s Mission
                </p>

                <h2 className="text-4xl font-semibold leading-tight tracking-tight">
                  {mission.title}
                </h2>

                <div className="space-y-4">
                  <p className="text-base text-muted-foreground">
                    {`Project: ${mission.projectName}`}
                  </p>

                  <TaskStatusSelect taskId={mission.id} status={mission.status} />
                </div>
              </div>

              <Badge
                variant={PRIORITY_VARIANTS[mission.priority]}
                className="h-6 shrink-0 px-3 uppercase tracking-wider"
              >
                {PRIORITY_LABELS[mission.priority]}
              </Badge>
            </div>
          ) : (
            /* No actionable task: completed missions stay in history, they
               just stop being "today's mission". */
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Today&apos;s Mission
              </p>

              <h2 className="text-4xl font-semibold leading-tight tracking-tight">
                You&apos;re clear for today.
              </h2>

              <p className="text-base text-muted-foreground">
                Create or select a new task when you&apos;re ready.
              </p>

              <CreateTaskDialog projects={projects} triggerLabel="Create Task" />
            </div>
          )}

          {mission ? (
            <>
              <Separator className="my-8" />

              <div className="space-y-5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    Mission Checklist
                  </p>

                  <p className="text-sm font-semibold tabular-nums">
                    {completedCount} / {steps.length} Complete
                  </p>
                </div>

                <div
                  role="progressbar"
                  aria-label="Mission progress"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {steps.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No checklist yet.
                    </p>

                    {isAdding ? (
                      <div className="mt-4 text-left">{addStepForm}</div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="mt-4"
                        onClick={() => setIsAdding(true)}
                      >
                        <PlusIcon />
                        Add First Step
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <ul className="space-y-1">
                      {steps.map((step, index) => (
                        <li
                          key={step.id}
                          className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={step.completed}
                            onChange={() => toggleStep(step)}
                            aria-label={`Mark ${step.title} as ${
                              step.completed ? "incomplete" : "complete"
                            }`}
                            className="size-4 shrink-0 accent-foreground disabled:cursor-not-allowed"
                          />

                          {editingId === step.id ? (
                            <Input
                              autoFocus
                              value={editingTitle}
                              maxLength={200}
                              onChange={(event) =>
                                setEditingTitle(event.target.value)
                              }
                              onBlur={() => saveTitle(step)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  saveTitle(step);
                                }
                                if (event.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                              className="h-8"
                            />
                          ) : (
                            <span
                              className={`flex-1 truncate text-sm ${
                                step.completed
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }`}
                            >
                              {step.title}
                            </span>
                          )}

                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Move step up"
                              disabled={index === 0}
                              onClick={() => moveStep(index, -1)}
                            >
                              <ChevronUpIcon />
                            </Button>

                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Move step down"
                              disabled={index === steps.length - 1}
                              onClick={() => moveStep(index, 1)}
                            >
                              <ChevronDownIcon />
                            </Button>

                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Rename step"
                              onClick={() => {
                                setEditingId(step.id);
                                setEditingTitle(step.title);
                              }}
                            >
                              <PencilIcon />
                            </Button>

                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Delete step"
                              onClick={() => deleteStep(step)}
                            >
                              <Trash2Icon />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {isAdding ? (
                      addStepForm
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsAdding(true)}
                      >
                        <PlusIcon />
                        Add Step
                      </Button>
                    )}
                  </>
                )}
              </div>

              <Separator className="my-8" />

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    Current Step
                  </p>

                  <p className="text-lg font-semibold tracking-tight">
                    {currentStep?.title ??
                      (steps.length === 0
                        ? "Add your first step"
                        : "All steps complete")}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    Next Step
                  </p>

                  <p className="text-lg font-semibold tracking-tight text-muted-foreground">
                    {nextStep?.title ?? "—"}
                  </p>
                </div>
              </div>

              <Separator className="my-8" />

              <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    Estimated Focus
                  </p>

                  <p className="text-3xl font-semibold tracking-tight">
                    {ESTIMATED_FOCUS_MINUTES} min
                  </p>
                </div>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-12 px-6 text-base"
                    onClick={() =>
                      router.push(`/content/new?taskId=${mission.id}`)
                    }
                  >
                    <ClapperboardIcon />
                    Create Content
                  </Button>

                  <Button
                    type="button"
                    size="lg"
                    className="h-12 px-8 text-base"
                    onClick={() => router.push(`/focus/${mission.id}`)}
                  >
                    <PlayIcon />
                    Start Focus Session
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="rounded-3xl border bg-card p-7 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">
          Harper Briefing
        </p>

        <div className="mt-5 space-y-4">
          <p className="text-base font-medium">
            <DailyGreeting serverGreeting={greeting} firstName={firstName} />
          </p>

          {mission ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current priority
                </p>

                <p className="text-sm font-medium leading-6">
                  {harper?.currentPriority ?? mission.title}
                </p>
              </div>

              {steps.length > 0 ? (
                <p className="text-sm leading-6 text-muted-foreground tabular-nums">
                  Progress: {completedCount} / {steps.length} complete (
                  {progressPercent}%).
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              There is no active mission right now.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-muted/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Next move
          </p>

          {/* Latest saved advice, or the deterministic rule when Harper has
              not run yet. Rendering never calls the model. */}
          <p className="mt-2 text-sm leading-6">
            {harper?.nextMove ?? harperRecommendation(progress, mission !== null)}
          </p>
        </div>

        {/* Entry points to Harper and Renee live in the Executive Team strip
            above, so this panel stays a mission briefing rather than a second
            navigation surface. */}
      </div>
    </>
  );
}

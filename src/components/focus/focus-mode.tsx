"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react";

import type { TaskStatus } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  deriveMissionProgress,
  harperRecommendation,
  type MissionStep,
} from "@/lib/mission";
import { useDeferredRefresh } from "@/lib/use-deferred-refresh";
import { useHarperAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";
import {
  ESTIMATED_FOCUS_MINUTES,
  FOCUS_SESSION_MINUTES,
  computeElapsedSeconds,
  computeRemainingSeconds,
  formatClock,
  toDurationMinutes,
  type FocusSessionAction,
  type FocusSessionDto,
} from "@/lib/focus";
import { SectionLabel } from "@/components/ui/section-label";

interface FocusMission {
  id: string;
  title: string;
  projectName: string;
  status: TaskStatus;
}

interface FocusModeProps {
  mission: FocusMission;
  initialSteps: MissionStep[];
  initialSession: FocusSessionDto | null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function requestJson(input: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload;
}

export function FocusMode({
  mission,
  initialSteps,
  initialSession,
}: FocusModeProps) {
  const router = useRouter();
  const scheduleRefresh = useDeferredRefresh();
  const scheduleHarperRefresh = useHarperAutoRefresh();
  const [steps, setSteps] = useState<MissionStep[]>(initialSteps);
  const [session, setSession] = useState<FocusSessionDto | null>(
    initialSession
  );
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(mission.status);
  // Null until mount: server and client must render the same first frame, so
  // the live clock only starts once we're safely past hydration.
  const [now, setNow] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Guards against two clicks (or a click plus a refresh) opening two sessions.
  const inFlight = useRef(false);

  const isRunning = session?.status === "ACTIVE";

  useEffect(() => {
    setNow(Date.now());
  }, []);

  // One interval, only while the clock is actually running.
  useEffect(() => {
    if (!isRunning) return;

    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const elapsedSeconds =
    now === null
      ? (session?.elapsedSeconds ?? 0)
      : computeElapsedSeconds(session, now);
  const remainingSeconds = computeRemainingSeconds(elapsedSeconds);
  const isOvertime = session !== null && remainingSeconds === 0;

  const progress = useMemo(() => deriveMissionProgress(steps), [steps]);
  const recommendation = harperRecommendation(progress, true);

  const mutateSession = useCallback(
    async (action: FocusSessionAction): Promise<FocusSessionDto | null> => {
      if (!session || inFlight.current) return null;

      inFlight.current = true;
      setIsBusy(true);

      try {
        const updated = (await requestJson("/api/focus-sessions", {
          method: "PATCH",
          body: JSON.stringify({ sessionId: session.id, action }),
        })) as FocusSessionDto;

        setSession(updated);
        setNow(Date.now());
        return updated;
      } catch (error) {
        toast.error(errorMessage(error, "Failed to update the focus session"));
        return null;
      } finally {
        inFlight.current = false;
        setIsBusy(false);
      }
    },
    [session]
  );

  async function startSession() {
    if (session || inFlight.current) return;

    inFlight.current = true;
    setIsBusy(true);

    try {
      const created = (await requestJson("/api/focus-sessions", {
        method: "POST",
        body: JSON.stringify({ taskId: mission.id }),
      })) as FocusSessionDto;

      setSession(created);
      setNow(Date.now());
    } catch (error) {
      toast.error(errorMessage(error, "Failed to start the focus session"));
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  }

  async function endSession() {
    const ended = await mutateSession("END");
    if (!ended) return;

    const minutes = ended.durationMinutes ?? toDurationMinutes(elapsedSeconds);

    setIsLeaving(true);
    router.push(`/dashboard?focusMinutes=${minutes}`);
    router.refresh();
  }

  /** Leaving without ending banks the time and keeps the session resumable. */
  async function exitFocusMode() {
    if (session && session.status === "ACTIVE") {
      await mutateSession("PAUSE");
    }

    setIsLeaving(true);
    router.push("/dashboard");
    router.refresh();
  }

  async function completeCurrentStep() {
    const step = progress.currentStep;
    if (!step) return;

    const previous = steps;
    setSteps((current) =>
      current.map((item) =>
        item.id === step.id ? { ...item, completed: true } : item
      )
    );

    try {
      await requestJson("/api/task-steps", {
        method: "PATCH",
        body: JSON.stringify({ stepId: step.id, completed: true }),
      });
      scheduleRefresh();
      scheduleHarperRefresh();
    } catch (error) {
      setSteps(previous);
      toast.error(errorMessage(error, "Failed to complete the step"));
    }
  }

  async function markMissionDone() {
    setIsBusy(true);

    try {
      let minutes: number | null = null;

      if (session) {
        const ended = await mutateSession("COMPLETE_MISSION");
        if (!ended) return;

        minutes =
          ended.durationMinutes ?? toDurationMinutes(elapsedSeconds);
      } else {
        await requestJson("/api/tasks", {
          method: "PATCH",
          body: JSON.stringify({ taskId: mission.id, status: "DONE" }),
        });
      }

      setTaskStatus("DONE");
      setIsLeaving(true);
      router.push(
        `/dashboard?missionCompleted=1${
          minutes === null ? "" : `&focusMinutes=${minutes}`
        }`
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update the mission"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Sticky so the way out is reachable without scrolling, whatever the
          checklist length. */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background px-6 py-4 sm:px-10">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={exitFocusMode}
          disabled={isLeaving}
        >
          <ArrowLeftIcon />
          Back to Dashboard
        </Button>

        <SectionLabel>
          Focus Mode
        </SectionLabel>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-10">
        <section className="space-y-3 text-center">
          <SectionLabel>
            {mission.projectName}
          </SectionLabel>

          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {mission.title}
          </h1>
        </section>

        {progress.isComplete ? (
          <section className="space-y-6 rounded-2xl border p-10 text-center">
            <div className="space-y-2">
              <SectionLabel>
                Mission Complete
              </SectionLabel>

              <p className="text-2xl font-semibold tracking-tight">
                All {progress.totalSteps} steps are done.
              </p>

              <p className="text-sm text-muted-foreground">
                {taskStatus === "DONE"
                  ? "This mission is marked done."
                  : "The mission stays open until you mark it done."}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={exitFocusMode}
                disabled={isLeaving}
              >
                Return to Dashboard
              </Button>

              {taskStatus === "DONE" ? null : (
                <Button
                  type="button"
                  size="lg"
                  onClick={markMissionDone}
                  disabled={isBusy}
                >
                  <CheckIcon />
                  Mark mission as done
                </Button>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <SectionLabel>
                Current Step
              </SectionLabel>

              <p className="text-xl font-semibold tracking-tight">
                {progress.currentStep?.title ?? "No checklist yet"}
              </p>
            </div>

            <div className="space-y-2">
              <SectionLabel>
                Next Step
              </SectionLabel>

              <p className="text-xl font-semibold tracking-tight text-muted-foreground">
                {progress.nextStep?.title ?? "—"}
              </p>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <SectionLabel>
              Mission Progress
            </SectionLabel>

            <p className="text-sm font-semibold tabular-nums">
              {progress.completedCount} / {progress.totalSteps} Complete
            </p>
          </div>

          <div
            role="progressbar"
            aria-label="Mission progress"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-8 text-center">
          <div className="space-y-2">
            <p className="text-7xl font-semibold tabular-nums tracking-tight sm:text-8xl">
              {formatClock(remainingSeconds)}
            </p>

            <p className="text-sm text-muted-foreground">
              {!session
                ? `${FOCUS_SESSION_MINUTES} minute block · not started`
                : isOvertime
                  ? `Block complete · ${formatClock(elapsedSeconds)} focused`
                  : session.status === "PAUSED"
                    ? "Paused"
                    : "In focus"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {!session ? (
              <Button
                type="button"
                size="lg"
                className="h-12 px-8 text-base"
                onClick={startSession}
                disabled={isBusy}
              >
                <PlayIcon />
                Start
              </Button>
            ) : (
              <>
                {session.status === "ACTIVE" ? (
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 px-8 text-base"
                    onClick={() => mutateSession("PAUSE")}
                    disabled={isBusy}
                  >
                    <PauseIcon />
                    Pause
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 px-8 text-base"
                    onClick={() => mutateSession("RESUME")}
                    disabled={isBusy}
                  >
                    <PlayIcon />
                    Resume
                  </Button>
                )}

                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base"
                  onClick={() => mutateSession("RESET")}
                  disabled={isBusy}
                >
                  <RotateCcwIcon />
                  Reset
                </Button>

                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base"
                  onClick={endSession}
                  disabled={isBusy || isLeaving}
                >
                  <SquareIcon />
                  End Session
                </Button>
              </>
            )}
          </div>

          <SectionLabel>
            Estimated Focus · {ESTIMATED_FOCUS_MINUTES} min
          </SectionLabel>
        </section>

        {progress.isComplete ? null : (
          <>
            <Separator />

            <section className="space-y-4">
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                onClick={completeCurrentStep}
                disabled={!progress.currentStep}
              >
                <CheckIcon />
                Complete Current Step
              </Button>

              <p className="text-center text-sm leading-6 text-muted-foreground">
                {recommendation}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

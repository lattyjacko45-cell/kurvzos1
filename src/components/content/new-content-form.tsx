"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONTENT_TYPE_LABELS,
  MAX_TITLE_LENGTH,
  type ContentTypeValue,
} from "@/lib/content";
import { browserTimeZone } from "@/lib/timezone";

export interface SelectableTask {
  id: string;
  title: string;
  projectName: string;
}

interface NewContentFormProps {
  tasks: SelectableTask[];
  /** Pre-selected task: /content/new?taskId=… or Today's Mission. */
  initialTaskId: string | null;
  missionTaskId: string | null;
}

type Source = "SCRATCH" | "TASK";

export function NewContentForm({
  tasks,
  initialTaskId,
  missionTaskId,
}: NewContentFormProps) {
  const router = useRouter();
  const inFlight = useRef(false);

  const [source, setSource] = useState<Source>(
    initialTaskId ? "TASK" : "SCRATCH"
  );
  const [taskId, setTaskId] = useState<string>(
    initialTaskId ?? missionTaskId ?? tasks[0]?.id ?? ""
  );
  const [title, setTitle] = useState("");
  const [contentType, setContentType] =
    useState<ContentTypeValue>("LONG_FORM");
  const [isSaving, setIsSaving] = useState(false);
  const [timezone, setTimezone] = useState("UTC");

  // Resolved after mount so the server render stays deterministic.
  useEffect(() => {
    setTimezone(browserTimeZone());
  }, []);

  // Borrow the task's title as a starting point.
  useEffect(() => {
    if (source !== "TASK" || title) return;

    const task = tasks.find((candidate) => candidate.id === taskId);
    if (task) setTitle(task.title);
  }, [source, taskId, tasks, title]);

  function useMission() {
    if (!missionTaskId) return;
    setSource("TASK");
    setTaskId(missionTaskId);

    const task = tasks.find((candidate) => candidate.id === missionTaskId);
    if (task) setTitle(task.title);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;

    if (!title.trim()) {
      toast.error("Give the content a title.");
      return;
    }

    inFlight.current = true;
    setIsSaving(true);

    try {
      const response = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          contentType,
          taskId: source === "TASK" && taskId ? taskId : null,
          timezone,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not create content");
      }

      const created = (await response.json()) as { id: string };
      toast.success("Content created");
      router.push(`/content/${created.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create content"
      );
      inFlight.current = false;
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Start from</legend>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={source === "SCRATCH" ? "default" : "outline"}
            onClick={() => setSource("SCRATCH")}
          >
            From scratch
          </Button>

          <Button
            type="button"
            variant={source === "TASK" ? "default" : "outline"}
            onClick={() => setSource("TASK")}
            disabled={tasks.length === 0}
          >
            From a task
          </Button>

          {missionTaskId ? (
            <Button type="button" variant="outline" onClick={useMission}>
              From Today&apos;s Mission
            </Button>
          ) : null}
        </div>
      </fieldset>

      {source === "TASK" ? (
        <div className="space-y-2">
          <Label htmlFor="content-task">Linked task</Label>
          <select
            id="content-task"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title} — {task.projectName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="content-new-title">Content title</Label>
        <Input
          id="content-new-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="Friday YouTube video"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content-new-type">Content type</Label>
        <select
          id="content-new-type"
          value={contentType}
          onChange={(event) =>
            setContentType(event.target.value as ContentTypeValue)
          }
          className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
        >
          {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isSaving}>
        {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
        Create content
      </Button>
    </form>
  );
}

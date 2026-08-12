"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TASK_TEMPLATES, getTaskTemplate } from "@/config/task-templates";
import { createTaskWithSteps } from "@/lib/task-creation";
import { useHarperAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";

interface CreateProjectDialogProps {
  workspaceId: string;
  /**
   * Set only when the page was opened from the first-run guide. Established
   * users creating an ordinary project stay where they are, as before.
   */
  returnToDashboard?: boolean;
}

export function CreateProjectDialog({
  workspaceId,
  returnToDashboard = false,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, workspaceId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create project");
      }

      setOpen(false);
      setName("");
      setDescription("");

      if (returnToDashboard) {
        // A first-run user has no reason to know the guide is back on the
        // dashboard, so take them there and name the next step.
        toast.success("Project created. Next, add your first task.");
        router.push("/dashboard");
        return;
      }

      toast.success("Project created!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 size-4" />
        New Project
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Add a new project to your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Website Redesign"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                disabled={isLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CreateTaskDialogProps {
  projects: Array<{ id: string; name: string }>;
  /** Defaults to "New Task"; the mission card's empty state overrides it. */
  triggerLabel?: string;
  /** Set only when the page was opened from the first-run guide. */
  returnToDashboard?: boolean;
}

type CreateMode = "BLANK" | "TEMPLATE";

export function CreateTaskDialog({
  projects,
  triggerLabel = "New Task",
  returnToDashboard = false,
}: CreateTaskDialogProps) {
  const router = useRouter();
  const scheduleHarperRefresh = useHarperAutoRefresh();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inFlight = useRef(false);
  const [mode, setMode] = useState<CreateMode>("BLANK");
  const [templateId, setTemplateId] = useState<string>(
    TASK_TEMPLATES[0]?.id ?? ""
  );
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [priority, setPriority] = useState("MEDIUM");

  const selectedTemplate = mode === "TEMPLATE" ? getTaskTemplate(templateId) : null;

  function resetForm() {
    setTitle("");
    setMode("BLANK");
    setTemplateId(TASK_TEMPLATES[0]?.id ?? "");
  }

  /** Switching to a template suggests its title; the field stays editable. */
  function applyMode(nextMode: CreateMode) {
    setMode(nextMode);

    if (nextMode === "BLANK") {
      setTitle("");
      return;
    }

    const template = getTaskTemplate(templateId);
    if (template) setTitle(template.suggestedTitle);
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);

    const template = getTaskTemplate(nextTemplateId);
    if (template) setTitle(template.suggestedTitle);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Guards against a double click or an Enter-key repeat firing twice before
    // React has re-rendered with isLoading.
    if (inFlight.current) return;

    if (!projectId) {
      toast.error("Create a project first");
      return;
    }

    inFlight.current = true;
    setIsLoading(true);

    try {
      const steps = selectedTemplate ? selectedTemplate.steps : [];
      const result = await createTaskWithSteps(
        { title, projectId, priority },
        steps
      );

      setOpen(false);
      resetForm();
      // A new task can outrank the current mission.
      scheduleHarperRefresh();

      if (returnToDashboard) {
        // Back to the guide, where Today's Mission now has something to show.
        toast.success("Task created. Here's today's mission.");
        router.push("/dashboard");
        return;
      }

      toast.success(
        result.stepsCreated > 0
          ? `Task created with ${result.stepsCreated} steps!`
          : "Task created!"
      );

      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 size-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>Add a new task to a project.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Start from</Label>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "BLANK" ? "default" : "outline"}
                  onClick={() => applyMode("BLANK")}
                  disabled={isLoading}
                >
                  Start Blank
                </Button>

                <Button
                  type="button"
                  variant={mode === "TEMPLATE" ? "default" : "outline"}
                  onClick={() => applyMode("TEMPLATE")}
                  disabled={isLoading}
                >
                  Use Template
                </Button>
              </div>
            </div>

            {mode === "TEMPLATE" ? (
              <div className="space-y-2">
                <Label htmlFor="template">Template</Label>
                <select
                  id="template"
                  value={templateId}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                  disabled={isLoading}
                >
                  {TASK_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>

                {selectedTemplate ? (
                  <ol className="mt-2 max-h-32 space-y-1 overflow-auto rounded-lg border p-3 text-xs text-muted-foreground">
                    {selectedTemplate.steps.map((step, index) => (
                      <li key={step} className="tabular-nums">
                        {index + 1}. {step}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Implement auth flow"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <select
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                disabled={isLoading || projects.length === 0}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                disabled={isLoading}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading || projects.length === 0}>
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

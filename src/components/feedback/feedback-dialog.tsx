"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useExecutiveAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";
import { SupportLink } from "@/components/support-link";

export const FEEDBACK_TYPE_LABELS = {
  BUG: "Bug",
  CONFUSING: "Confusing",
  MISSING_FEATURE: "Missing Feature",
  IMPROVEMENT: "Improvement",
} as const;

export type FeedbackTypeValue = keyof typeof FEEDBACK_TYPE_LABELS;

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Picks up a task id from routes that carry one (e.g. /focus/<uuid>) or from a
 * ?taskId= query param. Returns null everywhere else.
 */
export function extractTaskId(
  pathname: string,
  taskIdParam: string | null
): string | null {
  if (taskIdParam && UUID_PATTERN.test(taskIdParam)) return taskIdParam;

  const match = pathname.match(UUID_PATTERN);
  return match ? match[0] : null;
}

export function FeedbackDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scheduleExecutiveRefresh = useExecutiveAutoRefresh();

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [type, setType] = useState<FeedbackTypeValue>("BUG");
  const [description, setDescription] = useState("");

  const capturedTaskId = extractTaskId(pathname, searchParams.get("taskId"));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = description.trim();
    if (!trimmed) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          description: trimmed,
          page: pathname,
          taskId: capturedTaskId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Failed to send feedback");
      }

      toast.success("Feedback sent. Thank you!");
      // Unresolved feedback is one of Olivia's friction signals.
      scheduleExecutiveRefresh();
      setOpen(false);
      setDescription("");
      setType("BUG");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<SidebarMenuButton tooltip="Send Feedback" className="w-full" />}
      >
        <MessageSquarePlus />
        <span>Send Feedback</span>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Send Feedback</DialogTitle>
            <DialogDescription>
              Tell us what got in your way. The current page is attached
              automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feedback-type">Type</Label>
              <select
                id="feedback-type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as FeedbackTypeValue)
                }
                className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
                disabled={isLoading}
              >
                {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-description">Description</Label>
              <textarea
                id="feedback-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What happened, and what did you expect?"
                required
                maxLength={2000}
                rows={4}
                disabled={isLoading}
                className="border-input bg-background w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1 rounded-lg border p-3 text-xs text-muted-foreground">
              <p className="truncate">
                <span className="font-medium">Page:</span> {pathname}
              </p>

              {capturedTaskId ? (
                <p className="truncate">
                  <span className="font-medium">Task:</span> {capturedTaskId}
                </p>
              ) : null}
            </div>

            {/* For anything that needs a reply — feedback is one-way. Renders
                nothing when no support address is configured. */}
            <SupportLink
              label="Need a direct reply?"
              className="text-xs text-muted-foreground"
            />
          </div>

          <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
            <Link
              href="/feedback"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              View all feedback
            </Link>

            <Button type="submit" disabled={isLoading || !description.trim()}>
              {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

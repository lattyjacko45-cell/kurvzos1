"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ExternalLinkIcon,
  ImageIcon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContentStatusBadge } from "@/components/content/content-status-badge";
import {
  CONTENT_TYPE_LABELS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  YOUTUBE_CATEGORIES,
  isAllowedThumbnailType,
  isAllowedVideoType,
  parseTags,
  tagsToInput,
  uploadProgressLabel,
  type ContentStatusValue,
  type ContentTypeValue,
  type FieldErrors,
} from "@/lib/content";
import {
  browserTimeZone,
  formatInTimeZone,
  zonedTimeToUtc,
} from "@/lib/timezone";
import { useExecutiveAutoRefresh } from "@/lib/harper/use-harper-auto-refresh";
import { SectionLabel } from "@/components/ui/section-label";

export interface ContentDetailItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  madeForKids: boolean;
  contentType: ContentTypeValue;
  status: ContentStatusValue;
  scheduledAt: string | null;
  timezone: string;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  uploadProgress: number;
  processingStatus: string | null;
  errorMessage: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  projectName: string | null;
}

interface ContentDetailProps {
  item: ContentDetailItem;
  youtubeConnected: boolean;
  browserTimezone: string;
  /**
   * The YouTube connection card, rendered immediately after the content
   * identity. It is a utility for this page, not the subject of it — showing
   * it above the title meant every content item opened on the channel's state
   * rather than its own.
   */
  connectionUtility?: React.ReactNode;
}

/** Splits a stored UTC instant into date/time inputs for a given zone. */
function splitInstant(
  instant: string | null,
  timeZone: string
): { date: string; time: string } {
  if (!instant) return { date: "", time: "" };

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
}

/**
 * How a browser → Google upload failed.
 *
 * XMLHttpRequest reports status 0 for anything that never produced an HTTP
 * response — a blocked CORS preflight looks identical to a dropped connection
 * from JavaScript. Calling that "the network dropped" sent us chasing the
 * wrong problem once already, so status 0 is now reported as what it actually
 * is: could not reach Google, or the browser refused the response.
 */
type UploadFailureKind =
  | "cors_or_network"
  | "unauthorized_upload"
  | "expired_session"
  | "google_4xx"
  | "google_5xx"
  | "aborted"
  | "unexpected";

const UPLOAD_FAILURE_MESSAGES: Record<UploadFailureKind, string> = {
  cors_or_network:
    "The upload could not reach YouTube. This is usually a blocked cross-origin request rather than a dropped connection — the browser reports no HTTP status for either. Retry, and if it repeats check that NEXT_PUBLIC_APP_URL matches the address you are browsing from.",
  unauthorized_upload:
    "YouTube rejected the upload session as unauthorized. Reconnect the channel and try again.",
  expired_session:
    "The upload session expired before the file finished.",
  google_4xx:
    "YouTube rejected the upload. Check the video file type and size, then retry.",
  google_5xx:
    "YouTube had a server error during the upload. Retrying usually clears it.",
  aborted: "The upload was cancelled.",
  unexpected: "The upload failed for an unexpected reason.",
};

class UploadFailure extends Error {
  readonly kind: UploadFailureKind;
  /** 0 when no HTTP response was produced. */
  readonly status: number;

  constructor(kind: UploadFailureKind, status: number) {
    super(UPLOAD_FAILURE_MESSAGES[kind]);
    this.name = "UploadFailure";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Safe client diagnostics. Records only what went wrong and the HTTP status —
 * never the session URI, an access token, or any authorization header.
 */
function logUploadFailure(kind: UploadFailureKind, status: number): void {
  console.error("[content] browser upload failed", { kind, status });
}

function classifyUploadStatus(status: number): UploadFailureKind {
  if (status === 0) return "cors_or_network";
  if (status === 401 || status === 403) return "unauthorized_upload";
  if (status === 404 || status === 410) return "expired_session";
  if (status >= 400 && status < 500) return "google_4xx";
  if (status >= 500) return "google_5xx";
  return "unexpected";
}

async function readError(response: Response): Promise<{
  message: string;
  fieldErrors?: FieldErrors;
}> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    fieldErrors?: FieldErrors;
  } | null;

  return {
    message: payload?.error ?? `Request failed with status ${response.status}`,
    fieldErrors: payload?.fieldErrors,
  };
}

export function ContentDetail({
  item,
  youtubeConnected,
  browserTimezone,
  connectionUtility,
}: ContentDetailProps) {
  const router = useRouter();
  // Pipeline changes are Sophia's significance trigger.
  const scheduleExecutiveRefresh = useExecutiveAutoRefresh();

  const initialSchedule = useMemo(
    () => splitInstant(item.scheduledAt, item.timezone),
    [item.scheduledAt, item.timezone]
  );

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [tagsInput, setTagsInput] = useState(tagsToInput(item.tags));
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [madeForKids, setMadeForKids] = useState(item.madeForKids);
  const [contentType, setContentType] = useState<ContentTypeValue>(
    item.contentType
  );
  const [scheduleDate, setScheduleDate] = useState(initialSchedule.date);
  const [scheduleTime, setScheduleTime] = useState(initialSchedule.time);
  const [timezone, setTimezone] = useState(
    item.timezone === "UTC" ? browserTimezone : item.timezone
  );

  // The server can't know the reader's zone. If the row still holds the "UTC"
  // default, adopt the browser's zone after mount so hydration stays clean.
  useEffect(() => {
    if (item.timezone !== "UTC") return;

    const zone = browserTimeZone();
    if (zone && zone !== "UTC") setTimezone(zone);
  }, [item.timezone]);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(item.uploadProgress);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isThumbnailWorking, setIsThumbnailWorking] = useState(false);
  const [thumbnailWarning, setThumbnailWarning] = useState<string | null>(null);

  // One in-flight upload at a time, whatever the button state says.
  const uploadInFlight = useRef(false);

  const isLocked = Boolean(item.youtubeVideoId);

  /**
   * Statuses that mean a video already reached YouTube.
   *
   * These are checked alongside `youtubeVideoId` rather than instead of it. A
   * successful PUT followed by a failed `complete-upload` call leaves the row
   * with no video id, and the old guard — which looked only at the id — then
   * re-enabled "Retry upload", which uploaded the same file a second time.
   */
  const UPLOAD_ALREADY_DONE: ContentStatusValue[] = [
    "PROCESSING",
    "UPLOADED",
    "SCHEDULED",
    "PUBLISHED",
  ];

  const canUpload =
    youtubeConnected &&
    !isLocked &&
    item.status !== "UPLOADING" &&
    !UPLOAD_ALREADY_DONE.includes(item.status);

  function scheduledInstant(): string | null {
    if (!scheduleDate || !scheduleTime) return null;

    const instant = zonedTimeToUtc(`${scheduleDate}T${scheduleTime}`, timezone);
    return instant ? instant.toISOString() : null;
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (isSaving) return;

    // A date without a time (or vice versa) is a half-filled schedule.
    if (Boolean(scheduleDate) !== Boolean(scheduleTime)) {
      setFieldErrors({
        scheduledAt: "Enter both a date and a time, or clear both.",
      });
      return;
    }

    setIsSaving(true);
    setFieldErrors({});

    try {
      const response = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          tags: parseTags(tagsInput),
          categoryId,
          madeForKids,
          contentType,
          scheduledAt: scheduledInstant(),
          timezone,
        }),
      });

      if (!response.ok) {
        const { message, fieldErrors: errors } = await readError(response);
        if (errors) setFieldErrors(errors);
        throw new Error(message);
      }

      toast.success("Publishing details saved");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save details"
      );
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * PUTs the file straight to Google's resumable session URL.
   *
   * The YouTube resumable protocol requires Authorization on this request, so
   * the caller passes a short-lived access token. Content-Length is set by the
   * browser from the File — it is a forbidden header we must not set manually.
   *
   * The token is a parameter only. It is never written to state, storage, a
   * URL, or a log.
   */
  function putToYouTube(
    uploadUrl: string,
    file: File,
    accessToken: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", uploadUrl, true);
      request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      request.setRequestHeader("Content-Type", file.type);

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        setProgress(Math.round((event.loaded / event.total) * 100));
      };

      request.onload = () => {
        if (request.status < 200 || request.status >= 300) {
          // 404/410 means the session URI expired — recoverable by opening a
          // fresh one rather than failing the upload outright.
          const kind = classifyUploadStatus(request.status);
          logUploadFailure(kind, request.status);
          reject(new UploadFailure(kind, request.status));
          return;
        }

        try {
          const payload = JSON.parse(request.responseText) as { id?: string };
          if (!payload.id) {
            logUploadFailure("unexpected", request.status);
            reject(new UploadFailure("unexpected", request.status));
            return;
          }
          resolve(payload.id);
        } catch {
          logUploadFailure("unexpected", request.status);
          reject(new UploadFailure("unexpected", request.status));
        }
      };

      // status is 0 here: no HTTP response was produced. A refused CORS
      // preflight and a genuine connection failure are indistinguishable.
      request.onerror = () => {
        logUploadFailure("cors_or_network", request.status);
        reject(new UploadFailure("cors_or_network", request.status));
      };

      request.onabort = () => {
        logUploadFailure("aborted", request.status);
        reject(new UploadFailure("aborted", request.status));
      };

      request.send(file);
    });
  }

  async function reportFailure(message: string) {
    await fetch(`/api/content/${item.id}/complete-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ failed: true, errorMessage: message.slice(0, 500) }),
    }).catch(() => undefined);
  }

  async function uploadThumbnail(): Promise<void> {
    if (!thumbnailFile) return;

    const body = new FormData();
    body.append("thumbnail", thumbnailFile);

    const response = await fetch(`/api/content/${item.id}/thumbnail`, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      const { message } = await readError(response);
      throw new Error(message);
    }
  }

  async function startUpload() {
    if (uploadInFlight.current) return;

    if (!videoFile) {
      toast.error("Choose a video file first.");
      return;
    }

    if (!isAllowedVideoType(videoFile.type)) {
      toast.error("That file type is not a supported video format.");
      return;
    }

    // Captured after the guard so the nested helper has a non-null File.
    const file = videoFile;

    uploadInFlight.current = true;
    setIsUploading(true);
    setProgress(0);
    setThumbnailWarning(null);

    /**
     * Opens a resumable session. Returns the session URI plus the short-lived
     * access token the PUT needs. The refresh token stays on the server.
     */
    async function openSession(): Promise<{
      uploadUrl: string;
      accessToken: string;
    }> {
      const sessionResponse = await fetch(
        `/api/content/${item.id}/upload-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileSize: file.size,
            mimeType: file.type,
          }),
        }
      );

      if (!sessionResponse.ok) {
        const { message, fieldErrors: errors } = await readError(
          sessionResponse
        );
        if (errors) setFieldErrors(errors);
        throw new Error(message);
      }

      const { uploadUrl, accessToken } = (await sessionResponse.json()) as {
        uploadUrl: string;
        accessToken: string;
      };

      return { uploadUrl, accessToken };
    }

    try {
      /**
       * One upload attempt. The session URI and its access token live only in
       * this scope — they are never stored, and they fall out of memory when
       * the attempt resolves or throws.
       */
      const attempt = async (): Promise<string> => {
        const session = await openSession();
        return putToYouTube(session.uploadUrl, file, session.accessToken);
      };

      let videoId: string;

      try {
        videoId = await attempt();
      } catch (error) {
        // Both cases are recoverable by starting over with a fresh session and
        // a freshly minted token: an expired session URI (404/410), or an
        // expired or rejected access token (401/403).
        const recoverable =
          error instanceof UploadFailure &&
          (error.kind === "expired_session" ||
            error.kind === "unauthorized_upload");

        if (!recoverable) throw error;

        toast.info(
          error instanceof UploadFailure && error.kind === "expired_session"
            ? "The upload session expired. Starting a new one."
            : "The upload authorization expired. Starting a new session."
        );

        setProgress(0);
        videoId = await attempt();
      }

      const completeResponse = await fetch(
        `/api/content/${item.id}/complete-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeVideoId: videoId }),
        }
      );

      if (!completeResponse.ok) {
        const { message } = await readError(completeResponse);
        throw new Error(message);
      }

      // Thumbnail failure must not lose the scheduled video.
      if (thumbnailFile) {
        try {
          await uploadThumbnail();
        } catch (error) {
          setThumbnailWarning(
            error instanceof Error
              ? error.message
              : "The thumbnail did not upload."
          );
        }
      }

      toast.success("Video uploaded to YouTube");
      scheduleExecutiveRefresh();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The upload failed.";
      await reportFailure(message);
      toast.error(message);
      router.refresh();
    } finally {
      uploadInFlight.current = false;
      setIsUploading(false);
    }
  }

  async function retryThumbnail() {
    if (!thumbnailFile) {
      toast.error("Choose a thumbnail image first.");
      return;
    }

    if (!isAllowedThumbnailType(thumbnailFile.type)) {
      toast.error("Thumbnails must be JPEG or PNG.");
      return;
    }

    setIsThumbnailWorking(true);

    try {
      await uploadThumbnail();
      setThumbnailWarning(null);
      toast.success("Thumbnail updated");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Thumbnail upload failed.";
      setThumbnailWarning(message);
      toast.error(message);
    } finally {
      setIsThumbnailWorking(false);
    }
  }

  async function refreshStatus() {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/content/${item.id}/refresh-status`, {
        method: "POST",
      });

      if (!response.ok) {
        const { message } = await readError(response);
        throw new Error(message);
      }

      toast.success("Status refreshed");
      scheduleExecutiveRefresh();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not refresh status"
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function publishNow() {
    setIsPublishing(true);

    try {
      const response = await fetch(`/api/content/${item.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      if (!response.ok) {
        const { message } = await readError(response);
        throw new Error(message);
      }

      toast.success("Video published");
      setPublishOpen(false);
      scheduleExecutiveRefresh();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not publish the video"
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function markTaskComplete() {
    if (!item.taskId) return;

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: item.taskId, status: "DONE" }),
      });

      if (!response.ok) {
        const { message } = await readError(response);
        throw new Error(message);
      }

      toast.success("Task marked complete");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the task"
      );
    }
  }

  const describedBy = (field: string) =>
    fieldErrors[field] ? `${field}-error` : undefined;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {/* Display serif, matching every other page title in KurvzOS. */}
          <h1 className="font-serif text-display-md">{item.title}</h1>

          <p className="text-sm text-muted-foreground">
            {item.projectName ?? "No project"}
            {item.taskTitle ? ` · ${item.taskTitle}` : ""}
          </p>
        </div>

        <ContentStatusBadge status={item.status} />
      </section>

      {connectionUtility}

      {/*
        Publishing status is the operational centre of this page — it is where
        the current state and the one action available right now both live — so
        it carries card weight while the sections below it stay on the page
        background. Every condition and action inside is unchanged.
      */}
      <section
        aria-labelledby="status-heading"
        className="space-y-3 rounded-2xl border bg-card p-6"
      >
        <SectionLabel as="h2" id={"status-heading"}>
          Publishing status
        </SectionLabel>

        <p role="status" aria-live="polite" className="text-sm">
          {isUploading
            ? uploadProgressLabel("UPLOADING", progress)
            : uploadProgressLabel(item.status, item.uploadProgress)}
        </p>

        {(isUploading || item.status === "UPLOADING") && (
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {item.errorMessage ? (
          <p className="text-sm text-destructive">{item.errorMessage}</p>
        ) : null}

        {thumbnailWarning ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-sm">
              The video is safe, but the thumbnail did not upload:{" "}
              {thumbnailWarning}
            </p>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={retryThumbnail}
              disabled={isThumbnailWorking}
            >
              <ImageIcon />
              Retry thumbnail
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {item.youtubeVideoId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refreshStatus}
              disabled={isRefreshing}
            >
              <RefreshCwIcon />
              Refresh status
            </Button>
          ) : null}

          {/* External navigation — a styled anchor, not a Button. */}
          {item.youtubeUrl ? (
            <a
              href={item.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLinkIcon />
              Open on YouTube
            </a>
          ) : null}
        </div>

        {item.scheduledAt ? (
          <p className="text-sm text-muted-foreground">
            Scheduled for {formatInTimeZone(new Date(item.scheduledAt), item.timezone)}{" "}
            ({item.timezone})
          </p>
        ) : null}
      </section>

      {item.status === "SCHEDULED" && item.taskId && item.taskStatus !== "DONE" ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5">
          <p className="text-sm">
            This content is scheduled. Mark{" "}
            <span className="font-medium">{item.taskTitle}</span> complete?
          </p>

          <Button type="button" size="sm" onClick={markTaskComplete}>
            Mark task complete
          </Button>
        </section>
      ) : null}

      <Separator />

      <form onSubmit={saveDetails} className="space-y-6" noValidate>
        <SectionLabel as="h2">
          Publishing details
        </SectionLabel>

        <div className="space-y-2">
          <Label htmlFor="content-title">YouTube title</Label>
          <Input
            id="content-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            required
            disabled={isLocked}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={describedBy("title")}
          />
          <p className="text-xs text-muted-foreground">
            {title.length} / {MAX_TITLE_LENGTH}
          </p>
          {fieldErrors.title ? (
            <p id="title-error" className="text-sm text-destructive">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="content-description">Description</Label>
          <textarea
            id="content-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={5}
            disabled={isLocked}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={describedBy("description")}
            className="border-input bg-background w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          {fieldErrors.description ? (
            <p id="description-error" className="text-sm text-destructive">
              {fieldErrors.description}
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="content-tags">Tags</Label>
            <Input
              id="content-tags"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="editing, workflow, youtube"
              disabled={isLocked}
              aria-invalid={Boolean(fieldErrors.tags)}
              aria-describedby={describedBy("tags")}
            />
            <p className="text-xs text-muted-foreground">
              Separate tags with commas.
            </p>
            {fieldErrors.tags ? (
              <p id="tags-error" className="text-sm text-destructive">
                {fieldErrors.tags}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-category">Category</Label>
            <select
              id="content-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={isLocked}
              aria-invalid={Boolean(fieldErrors.categoryId)}
              className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
            >
              {YOUTUBE_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-type">Content type</Label>
            <select
              id="content-type"
              value={contentType}
              onChange={(event) =>
                setContentType(event.target.value as ContentTypeValue)
              }
              disabled={isLocked}
              className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
            >
              {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-kids">Made for kids</Label>
            <select
              id="content-kids"
              value={madeForKids ? "yes" : "no"}
              onChange={(event) => setMadeForKids(event.target.value === "yes")}
              disabled={isLocked}
              className="border-input bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-date">Scheduled date</Label>
            <Input
              id="content-date"
              type="date"
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
              disabled={isLocked}
              aria-invalid={Boolean(fieldErrors.scheduledAt)}
              aria-describedby={describedBy("scheduledAt")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-time">Scheduled time</Label>
            <Input
              id="content-time"
              type="time"
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
              disabled={isLocked}
              aria-invalid={Boolean(fieldErrors.scheduledAt)}
              aria-describedby={describedBy("scheduledAt")}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="content-timezone">Timezone</Label>
            <Input
              id="content-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              disabled={isLocked}
              aria-invalid={Boolean(fieldErrors.timezone)}
              aria-describedby={describedBy("timezone")}
            />
            {fieldErrors.timezone ? (
              <p id="timezone-error" className="text-sm text-destructive">
                {fieldErrors.timezone}
              </p>
            ) : null}
          </div>
        </div>

        {fieldErrors.scheduledAt ? (
          <p id="scheduledAt-error" className="text-sm text-destructive">
            {fieldErrors.scheduledAt}
          </p>
        ) : null}

        {isLocked ? (
          <p className="text-sm text-muted-foreground">
            This video is already on YouTube, so its details are locked here.
            Edit it in YouTube Studio.
          </p>
        ) : (
          <Button type="submit" disabled={isSaving}>
            Save publishing details
          </Button>
        )}
      </form>

      <Separator />

      <section aria-labelledby="upload-heading" className="space-y-5">
        <SectionLabel as="h2" id={"upload-heading"}>
          Video and thumbnail
        </SectionLabel>

        {!youtubeConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect a YouTube channel to upload.
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="content-video">Video file</Label>
          <input
            id="content-video"
            type="file"
            accept="video/*"
            disabled={!canUpload || isUploading}
            onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          {videoFile ? (
            <p className="text-xs text-muted-foreground">
              {videoFile.name} ·{" "}
              {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="content-thumbnail">Thumbnail (optional)</Label>
          <input
            id="content-thumbnail"
            type="file"
            accept="image/jpeg,image/png"
            disabled={isUploading}
            onChange={(event) =>
              setThumbnailFile(event.target.files?.[0] ?? null)
            }
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            JPEG or PNG, up to 2 MB.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Schedule is the primary action; publishing now is deliberate. */}
          <Button
            type="button"
            onClick={startUpload}
            disabled={!canUpload || isUploading || !videoFile}
          >
            <UploadIcon />
            {item.status === "FAILED"
              ? "Retry upload and schedule"
              : "Upload and schedule"}
          </Button>

          {item.youtubeVideoId && item.status !== "PUBLISHED" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPublishOpen(true)}
            >
              Publish now
            </Button>
          ) : null}

          {item.youtubeVideoId && thumbnailFile ? (
            <Button
              type="button"
              variant="outline"
              onClick={retryThumbnail}
              disabled={isThumbnailWorking}
            >
              <ImageIcon />
              Update thumbnail
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Uploading with a scheduled time keeps the video private on YouTube
          until that moment.
        </p>

        {/* Not a failure state: unaudited API projects have their uploads
            locked to private regardless of the requested privacy. */}
        <p className="text-xs text-muted-foreground">
          While the YouTube API project is unverified, uploads may stay private
          even after the scheduled time passes, until Google completes its
          audit. That is a project restriction, not an upload failure.
        </p>
      </section>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this video now?</DialogTitle>
            <DialogDescription>
              This makes the video public on YouTube immediately and clears the
              scheduled time. This cannot be undone from KurvzOS.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPublishOpen(false)}
              disabled={isPublishing}
            >
              Cancel
            </Button>

            <Button type="button" onClick={publishNow} disabled={isPublishing}>
              Publish now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-sm">
        <Link href="/content" className="underline underline-offset-4">
          Back to Content
        </Link>
      </p>
    </div>
  );
}

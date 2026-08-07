import { Badge } from "@/components/ui/badge";
import {
  CONTENT_STATUS_LABELS,
  type ContentStatusValue,
} from "@/lib/content";

const VARIANTS: Record<
  ContentStatusValue,
  "outline" | "secondary" | "default" | "destructive"
> = {
  DRAFT: "outline",
  READY: "secondary",
  UPLOADING: "secondary",
  PROCESSING: "secondary",
  UPLOADED: "secondary",
  SCHEDULED: "default",
  PUBLISHED: "default",
  FAILED: "destructive",
};

export function ContentStatusBadge({
  status,
}: {
  status: ContentStatusValue;
}) {
  return (
    <Badge
      variant={VARIANTS[status]}
      className="h-6 shrink-0 px-3 uppercase tracking-wider"
    >
      {CONTENT_STATUS_LABELS[status]}
    </Badge>
  );
}

import { ExternalLinkIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { FileModifiedTime } from "@/components/drive/file-modified-time";
import {
  formatFileSize,
  formatModifiedAt,
  type DriveFile,
} from "@/lib/drive/normalize";

interface DriveFileListProps {
  files: DriveFile[];
}

/**
 * Recent Drive files.
 *
 * Read-only by construction: the only control on a row is an external link to
 * Google Drive. There is no open, preview, download, rename, move or delete
 * affordance anywhere in this component, and no route exists that would serve
 * one — the granted scope cannot fetch file bytes at all.
 */
export function DriveFileList({ files }: DriveFileListProps) {
  return (
    <ul className="divide-y">
      {files.map((file) => {
        const size = formatFileSize(file.sizeBytes);

        return (
          <li key={file.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">
                {file.name}
              </p>

              <FileModifiedTime
                iso={file.modifiedAt}
                serverLabel={formatModifiedAt(file.modifiedAt)}
              />
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {file.typeLabel}
              {size ? ` · ${size}` : ""}
            </p>

            {file.webViewLink ? (
              <p className="mt-3">
                {/* External navigation — a styled anchor, not a Button. */}
                <a
                  href={file.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLinkIcon />
                  Open in Google Drive
                </a>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

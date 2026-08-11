"use client";

import { useEffect, useState } from "react";

import { formatModifiedAt } from "@/lib/drive/normalize";

interface FileModifiedTimeProps {
  /** ISO instant from the normalized file. */
  iso: string;
  /** Formatted with the server clock; used for the first paint. */
  serverLabel: string;
}

/**
 * The server cannot know the reader's timezone, so it renders its best guess
 * and the browser corrects to local time after mount. Same approach as
 * DailyGreeting and MessageTime — updating in an effect keeps hydration clean.
 */
export function FileModifiedTime({ iso, serverLabel }: FileModifiedTimeProps) {
  const [label, setLabel] = useState(serverLabel);

  useEffect(() => {
    setLabel(formatModifiedAt(iso));
  }, [iso]);

  return (
    <time dateTime={iso} className="shrink-0 text-xs tabular-nums text-muted-foreground">
      {label}
    </time>
  );
}

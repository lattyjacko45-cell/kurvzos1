"use client";

import { useEffect, useState } from "react";

import { formatMessageTimestamp } from "@/lib/gmail/normalize";

interface MessageTimeProps {
  /** ISO instant from the normalized message. */
  iso: string;
  /** Formatted with the server clock; used for the first paint. */
  serverLabel: string;
}

/**
 * The server cannot know the reader's timezone, so it renders its best guess
 * and the browser corrects to local time after mount. Same approach as
 * DailyGreeting — updating in an effect keeps hydration clean.
 */
export function MessageTime({ iso, serverLabel }: MessageTimeProps) {
  const [label, setLabel] = useState(serverLabel);

  useEffect(() => {
    setLabel(formatMessageTimestamp(iso));
  }, [iso]);

  return (
    <time dateTime={iso} className="shrink-0 text-xs tabular-nums text-muted-foreground">
      {label}
    </time>
  );
}

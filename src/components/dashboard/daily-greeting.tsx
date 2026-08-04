"use client";

import { useEffect, useState } from "react";

import { greetingForHour } from "@/lib/daily-briefing";

interface DailyGreetingProps {
  /** Greeting computed from the server clock; used for the first paint. */
  serverGreeting: string;
  firstName: string | null;
}

/**
 * The server can't know the reader's timezone, so we render its best guess and
 * correct to the browser's local hour after mount. Updating in an effect keeps
 * hydration clean.
 */
export function DailyGreeting({
  serverGreeting,
  firstName,
}: DailyGreetingProps) {
  const [greeting, setGreeting] = useState(serverGreeting);

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <>
      {greeting}
      {firstName ? `, ${firstName}` : ""}.
    </>
  );
}

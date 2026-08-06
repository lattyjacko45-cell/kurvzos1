"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Coalesces `router.refresh()` calls.
 *
 * Checklist edits arrive in bursts — check three boxes, drag two rows — and a
 * refresh per action re-runs every server query behind the dashboard. This
 * schedules one refresh after the burst settles and runs it inside a
 * transition, so React keeps the current UI interactive while the server tree
 * re-renders in the background.
 *
 * Optimistic local state is the source of truth for what the user sees; this
 * only reconciles the surrounding server-rendered panels.
 */
export function useDeferredRefresh(delayMs = 1500): () => void {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startTransition(() => router.refresh());
    }, delayMs);
  }, [delayMs, router, startTransition]);
}

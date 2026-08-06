"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks the server to consider a background refresh for every active executive.
 *
 * Each executive owns its own gate and decides independently whether the
 * change was significant enough to spend a model call. Harper cares about
 * execution — the mission and its checklist. Renee cares about the portfolio —
 * projects, weekly priority, shipped content. Sophia cares about the pipeline —
 * content stages, the schedule, publishing cadence. Olivia cares about the
 * shape of the work — stages, staleness, handoffs, focus sessions. The same
 * user action can therefore be significant to one and not the others.
 *
 * Three layers stop duplicate spend:
 *  1. Here — a debounce plus an in-flight guard, so a burst of clicks produces
 *     at most one round of requests.
 *  2. The per-executive significance gates on the server.
 *  3. `router.refresh()` only fires when someone actually produced new advice.
 *
 * The filename keeps its original name so existing call sites are untouched.
 */

const AUTO_REFRESH_ENDPOINTS = [
  "/api/harper/auto",
  "/api/renee/auto",
  "/api/sophia/auto",
  "/api/olivia/auto",
  "/api/marcus/auto",
] as const;

export function useHarperAutoRefresh(delayMs = 1200): () => void {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      timerRef.current = null;

      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const results = await Promise.all(
          AUTO_REFRESH_ENDPOINTS.map(async (endpoint) => {
            try {
              const response = await fetch(endpoint, { method: "POST" });
              if (!response.ok) return false;

              const result = (await response.json()) as {
                refreshed?: boolean;
              };
              return Boolean(result.refreshed);
            } catch {
              return false;
            }
          })
        );

        if (results.some(Boolean)) router.refresh();
      } finally {
        inFlightRef.current = false;
      }
    }, delayMs);
  }, [delayMs, router]);
}

/** Preferred name now that more than one executive is live. */
export const useExecutiveAutoRefresh = useHarperAutoRefresh;

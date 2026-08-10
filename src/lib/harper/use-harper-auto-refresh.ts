"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Routes background advice refreshes to the executives affected by an event.
 *
 * Harper handles execution and checklist progress. A completed task still
 * reaches the full team because it changes strategy, marketing, operations
 * and financial context. An ended timer reaches Olivia because focus history
 * is part of her operational diagnosis.
 *
 * Three layers stop duplicate spend:
 *  1. Here — a debounce plus an in-flight guard, so a burst of clicks produces
 *     at most one round of requests.
 *  2. Event routing here avoids asking unrelated executives to rebuild their
 *     contexts.
 *  3. `router.refresh()` only fires when someone actually produced new advice.
 *
 * The filename keeps its original name so existing call sites are untouched.
 */

const HARPER_REFRESH_ENDPOINTS = ["/api/harper/auto"] as const;

const TEAM_REFRESH_ENDPOINTS = [
  "/api/harper/auto",
  "/api/renee/auto",
  "/api/sophia/auto",
  "/api/olivia/auto",
  "/api/marcus/auto",
] as const;

const FOCUS_REFRESH_ENDPOINTS = ["/api/olivia/auto"] as const;

async function refreshAdvice(
  endpoints: readonly string[]
): Promise<boolean> {
  const results = await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint, { method: "POST" });
        if (!response.ok) return false;

        const result = (await response.json()) as { refreshed?: boolean };
        return Boolean(result.refreshed);
      } catch {
        return false;
      }
    })
  );

  return results.some(Boolean);
}

/** Checklist and task-detail changes concern Harper's execution brief. */
export function refreshHarperAdvice(): Promise<boolean> {
  return refreshAdvice(HARPER_REFRESH_ENDPOINTS);
}

/**
 * Runs one significance-gated refresh round for the full executive team.
 * Each endpoint still makes its own decision about whether a model call is
 * warranted; this helper only coordinates the requests and reports whether
 * any executive produced new advice.
 */
export async function refreshExecutiveAdvice(): Promise<boolean> {
  return refreshAdvice(TEAM_REFRESH_ENDPOINTS);
}

/** An ended timer changes Olivia's operations context, not the other briefs. */
export function refreshFocusAdvice(): Promise<boolean> {
  return refreshAdvice(FOCUS_REFRESH_ENDPOINTS);
}

function useAdviceAutoRefresh(
  refresh: () => Promise<boolean>,
  delayMs: number
): () => void {
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
        const refreshed = await refresh();
        if (refreshed) router.refresh();
      } finally {
        inFlightRef.current = false;
      }
    }, delayMs);
  }, [delayMs, refresh, router]);
}

export function useHarperAutoRefresh(delayMs = 1200): () => void {
  return useAdviceAutoRefresh(refreshHarperAdvice, delayMs);
}

export function useExecutiveAutoRefresh(delayMs = 1200): () => void {
  return useAdviceAutoRefresh(refreshExecutiveAdvice, delayMs);
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  refreshExecutiveAdvice,
  refreshFocusAdvice,
} from "@/lib/harper/use-harper-auto-refresh";

/**
 * Focus Mode hands the saved duration back through `?focusMinutes=`.
 * We surface it once, then strip the param so a refresh doesn't re-toast.
 */
export function FocusSessionToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shown = useRef(false);

  const focusMinutes = searchParams.get("focusMinutes");
  const missionCompleted = searchParams.get("missionCompleted") === "1";

  useEffect(() => {
    if ((focusMinutes === null && !missionCompleted) || shown.current) return;

    shown.current = true;

    const minutes =
      focusMinutes === null ? null : Number.parseInt(focusMinutes, 10);
    const hasValidMinutes =
      minutes !== null && Number.isFinite(minutes) && minutes >= 0;

    if (missionCompleted) {
      toast.success(
        hasValidMinutes
          ? `Mission completed — focus session saved (${minutes} ${minutes === 1 ? "minute" : "minutes"}).`
          : "Mission completed."
      );
    } else if (hasValidMinutes) {
      toast.success(
        `Focus session saved — ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
      );
    }

    // Remove the one-time toast parameters without requesting the dashboard a
    // second time. Native history stays in sync with Next's router.
    window.history.replaceState(null, "", pathname);

    // Navigation out of Focus Mode unmounts its debounced refresh hook. A
    // completed task reaches the whole team; a saved timer reaches Olivia,
    // whose operations context includes focus-session history.
    const refreshAdvice = missionCompleted
      ? refreshExecutiveAdvice
      : refreshFocusAdvice;

    void refreshAdvice().then((refreshed) => {
      if (refreshed) router.refresh();
    });
  }, [focusMinutes, missionCompleted, pathname, router]);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

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

  useEffect(() => {
    if (focusMinutes === null || shown.current) return;

    const minutes = Number.parseInt(focusMinutes, 10);
    if (Number.isFinite(minutes) && minutes >= 0) {
      shown.current = true;
      toast.success(
        `Focus session saved — ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
      );
    }

    router.replace(pathname);
  }, [focusMinutes, pathname, router]);

  return null;
}

"use client";

import { useEffect, useState } from "react";

import { AUTH_NOTICES, parseAuthErrorFragment } from "@/lib/auth-messages";

interface AuthNoticeBannerProps {
  /** Resolved server-side from `?error=` / `?notice=`. */
  serverNotice?: string;
}

/**
 * Shows why an auth link failed.
 *
 * Exists as a client component because Supabase reports a refused link in the
 * URL *fragment* — `#error=access_denied&error_code=otp_expired` — and
 * fragments are never sent to the server. No amount of middleware or server
 * component work can see them.
 *
 * The fragment wins when present: it carries Supabase's own reason, so it is
 * more precise than the callback's inference. The fragment is then stripped
 * with `replaceState` so a refresh does not resurrect a stale error, and so
 * the token-adjacent junk Supabase appends does not linger in the address bar.
 */
export function AuthNoticeBanner({ serverNotice }: AuthNoticeBannerProps) {
  const [notice, setNotice] = useState<string | undefined>(serverNotice);

  useEffect(() => {
    const fromFragment = parseAuthErrorFragment(window.location.hash);
    if (!fromFragment) return;

    setNotice(AUTH_NOTICES[fromFragment]);

    // Clear the fragment without adding a history entry.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
  }, []);

  if (!notice) return null;

  return (
    <p
      role="status"
      className="rounded-2xl border p-3 text-sm text-muted-foreground"
    >
      {notice}
    </p>
  );
}

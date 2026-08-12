import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { siteConfig } from "@/config/site";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set New Password",
};

/**
 * The change-password page at the end of the recovery link.
 *
 * Deliberately NOT listed as a protected route in middleware. A protected
 * route would bounce an expired link straight to /login with no explanation,
 * which is exactly the unexplained dead end this milestone exists to remove.
 * Instead the page checks for itself and renders a "link expired" state with a
 * way to request a new one.
 *
 * It is also deliberately not treated as an auth route: a live recovery
 * session *is* an authenticated session, so the "already signed in" rule would
 * redirect the user to the dashboard before they could set a password.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();

  /**
   * getUser() rather than getSession(): it revalidates the token with Supabase
   * rather than trusting whatever is in the cookie, so a tampered or expired
   * recovery cookie cannot present itself as a valid session.
   *
   * By the time this page renders, /auth/callback has already exchanged the
   * emailed code for a session. No user here means the link was expired,
   * already used, malformed, or never exchanged.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
          <span className="font-bold text-primary-foreground">K</span>
        </div>

        <span className="text-xl font-semibold">{siteConfig.name}</span>
      </Link>

      <ResetPasswordForm hasRecoverySession={Boolean(user)} />
    </div>
  );
}

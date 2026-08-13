import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { InviteOnlyNotice } from "@/components/auth/invite-only-notice";
import { siteConfig } from "@/config/site";
import { isPrivateBetaEnabled } from "@/lib/beta";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function SignupPage() {
  /**
   * Referenced literally so Next inlines it at build time.
   *
   * Presentation only — Supabase's "Allow new users to sign up" setting is the
   * real gate. When this is off (local development), the signup form is
   * rendered exactly as before so test accounts can still be created.
   */
  const inviteOnly = isPrivateBetaEnabled(process.env.NEXT_PUBLIC_PRIVATE_BETA);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
          <span className="font-bold text-primary-foreground">K</span>
        </div>
        <span className="text-xl font-semibold">{siteConfig.name}</span>
      </Link>

      {/* The form is not mounted in the invite-only state, so signUp() cannot
          be submitted from it. */}
      {inviteOnly ? <InviteOnlyNotice /> : <SignupForm />}
    </div>
  );
}

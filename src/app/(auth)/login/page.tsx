import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { siteConfig } from "@/config/site";
import {
  AUTH_NOTICES,
  isAuthNotice,
  isLinkFailureNotice,
} from "@/lib/auth-messages";
import { safeInternalRedirect } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { SignedInLinkError } from "@/components/auth/signed-in-link-error";

export const metadata: Metadata = {
  title: "Sign In",
};

interface LoginPageProps {
  searchParams: Promise<{
    redirect?: string;
    error?: string;
    notice?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirect, error, notice } = await searchParams;

  /**
   * Validated here, on the server, before it is ever handed to the form.
   * `safeInternalRedirect` parses rather than prefix-matches, so a
   * backslash-prefixed or protocol-relative destination cannot slip through.
   */
  const destination = safeInternalRedirect(
    redirect ?? null,
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  );

  // Only members of the closed notice set can reach the UI.
  const noticeKey = error ?? notice;
  const noticeText = isAuthNotice(noticeKey)
    ? AUTH_NOTICES[noticeKey]
    : undefined;

  /**
   * Middleware now lets an authenticated user reach this page when the URL
   * carries a link failure, so this page has to handle that case rather than
   * assume everyone here is signed out.
   */
  if (noticeText && isLinkFailureNotice(noticeKey)) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) return renderShell(<SignedInLinkError notice={noticeText} />);
  }

  return renderLogin(destination, noticeText);
}

/** Shared chrome so both states sit identically on the page. */
function renderShell(children: React.ReactNode) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
          <span className="font-bold text-primary-foreground">K</span>
        </div>

        <span className="text-xl font-semibold">{siteConfig.name}</span>
      </Link>

      {children}
    </div>
  );
}

function renderLogin(redirectTo: string, notice: string | undefined) {
  return renderShell(<LoginForm redirectTo={redirectTo} notice={notice} />);
}
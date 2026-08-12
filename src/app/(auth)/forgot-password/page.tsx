import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
          <span className="font-bold text-primary-foreground">K</span>
        </div>

        <span className="text-xl font-semibold">{siteConfig.name}</span>
      </Link>

      <ForgotPasswordForm />
    </div>
  );
}

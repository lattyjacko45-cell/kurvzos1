"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { buildAuthRedirectUrl, describeAuthError } from "@/lib/auth-messages";

/**
 * Long enough to discourage hammering the button, short enough not to trap
 * someone who genuinely mistyped their address. Supabase's own default mailer
 * allows only 2 emails per hour, so the real limit is upstream — this exists
 * to stop the UI encouraging requests that will simply be rejected.
 */
const RESEND_COOLDOWN_SECONDS = 30;

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function requestReset() {
    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      /**
       * Through /auth/callback, not straight to /reset-password.
       *
       * @supabase/ssr means the PKCE flow: the emailed link carries a code
       * that has to be exchanged for a session server-side. Pointing the link
       * directly at /reset-password would land the user there with no
       * recovery session and nothing to update.
       */
      redirectTo: buildAuthRedirectUrl(
        window.location.origin,
        "/reset-password"
      ),
    });

    setIsLoading(false);

    if (error) {
      // Real faults — malformed address, rate limiting — are still worth
      // reporting. Supabase does not error merely because an address is
      // unknown, so this cannot become an enumeration channel.
      toast.error(describeAuthError(error));
      return;
    }

    setSent(true);
    setCooldown(RESEND_COOLDOWN_SECONDS);

    const timer = setInterval(() => {
      setCooldown((remaining) => {
        if (remaining <= 1) {
          clearInterval(timer);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await requestReset();
  }

  if (sent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          {/*
            Deliberately says "if an account exists". Supabase does not reveal
            whether an address is registered, and neither should we — this
            wording reads the same whether or not the address is real.
          */}
          <CardDescription>
            If an account exists for that address, we have sent password reset
            instructions. The link expires after a short time and can only be
            used once.
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex flex-col gap-3">
          <Link href="/login" className={`w-full ${buttonVariants()}`}>
            Back to sign in
          </Link>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={requestReset}
            disabled={isLoading || cooldown > 0}
          >
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Reset password</CardTitle>
        <CardDescription>
          Enter the email address for your account and we will send you a reset
          link.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isLoading}
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send reset link
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            Remembered it?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

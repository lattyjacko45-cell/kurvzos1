"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { PasswordInput } from "@/components/auth/password-input";
import {
  SIGNUP_MESSAGES,
  buildAuthRedirectUrl,
  describeAuthError,
  describeSignupOutcome,
  isDuplicateSignupError,
  type SignupOutcome,
} from "@/lib/auth-messages";

export function SignupForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  /** Set once signup returns without a session; replaces the form. */
  const [outcome, setOutcome] = useState<SignupOutcome | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        /**
         * Where the confirmation link returns to. Required: without it
         * Supabase falls back to the project's Site URL, which in a local or
         * preview environment is usually the wrong host entirely.
         *
         * Routed through /auth/callback because @supabase/ssr means the PKCE
         * flow — the emailed link carries a code that must be exchanged for a
         * session server-side before any page can trust it.
         */
        emailRedirectTo: buildAuthRedirectUrl(
          window.location.origin,
          "/dashboard"
        ),
      },
    });

    if (error) {
      /**
       * A duplicate address is NOT surfaced as an error.
       *
       * With email confirmation disabled Supabase errors outright on a taken
       * address, and showing that made signup an enumeration oracle. It is
       * routed to the same ambiguous screen a brand-new signup gets, so both
       * outcomes are indistinguishable. No session is created either way, so
       * the existing account is never signed into and never re-provisioned.
       */
      if (isDuplicateSignupError(error)) {
        setOutcome("already_registered");
        setIsLoading(false);
        return;
      }

      // Never the provider's own string.
      toast.error(describeAuthError(error));
      setIsLoading(false);
      return;
    }

    const result = describeSignupOutcome(data);

    if (result === "signed_in") {
      // Email confirmation is disabled on this project, so a session already
      // exists and the dashboard is genuinely reachable.
      toast.success(SIGNUP_MESSAGES.signed_in.title);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    /**
     * No session. Pushing to /dashboard here — as this form used to — sent the
     * user into a middleware bounce back to /login with no explanation. Show
     * the state instead and let them choose.
     */
    setOutcome(result);
    setIsLoading(false);
  }

  /**
   * Confirmation-required and already-registered share this screen.
   *
   * They read identically on purpose: someone probing for valid addresses
   * learns nothing from the difference, while the real owner still gets a
   * route forward. Only the supporting line differs, and it offers actions
   * rather than confirming anything.
   */
  if (outcome) {
    const message = SIGNUP_MESSAGES[outcome];

    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{message.title}</CardTitle>
          <CardDescription>{message.body}</CardDescription>
        </CardHeader>

        <CardFooter className="flex flex-col gap-3">
          <Link href="/login" className={`w-full ${buttonVariants()}`}>
            Go to sign in
          </Link>

          <p className="text-muted-foreground text-center text-sm">
            Wrong address?{" "}
            <button
              type="button"
              onClick={() => setOutcome(null)}
              className="text-primary hover:underline"
            >
              Start over
            </button>
          </p>

          <p className="text-muted-foreground text-center text-sm">
            <Link href="/forgot-password" className="hover:underline">
              Reset your password
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create account</CardTitle>
        <CardDescription>
          Get started with KurvzOS in seconds
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              /* Prompts a password manager to offer a generated password and
                 to save it, rather than trying to fill an existing one. */
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create account
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>

          <p className="text-muted-foreground text-center text-xs">
            By creating an account, you agree to our{" "}
            <Link href="/terms" className="hover:underline">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

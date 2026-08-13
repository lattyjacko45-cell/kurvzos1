"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { describeAuthError } from "@/lib/auth-messages";
import { AuthNoticeBanner } from "@/components/auth/auth-notice-banner";
import { PasswordInput } from "@/components/auth/password-input";
import { SupportLink } from "@/components/support-link";
import { SUPPORT_SUBJECTS } from "@/lib/beta";
import { safeInternalRedirect } from "@/lib/security";

interface LoginFormProps {
  /**
   * Where to go after signing in. Comes from the `redirect` parameter that
   * middleware attaches when it bounces an unauthenticated user off a
   * protected page — read on the server and re-validated below.
   */
  redirectTo?: string;
  /** Copy for a `?error=`/`?notice=` state, already resolved server-side. */
  notice?: string;
}

export function LoginForm({ redirectTo, notice }: LoginFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Never the provider's own string.
      toast.error(describeAuthError(error));
      setIsLoading(false);
      return;
    }

    /**
     * Re-validated against this origin even though the server already checked
     * it. The parameter reaches the browser, so treating it as trusted here
     * would make the second half of the round trip the weak link.
     */
    const destination = safeInternalRedirect(
      redirectTo ?? null,
      window.location.origin
    );

    toast.success("Welcome back!");
    router.push(destination);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
        <CardDescription>
          Enter your credentials to access your workspace
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {/* Expired links, failed callbacks and post-reset confirmations all
              arrive here — as a query parameter, or as a URL fragment that
              only the browser can read. The banner resolves both. */}
          <AuthNoticeBanner serverNotice={notice} />

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
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="password">Password</Label>

              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              /* Tells a password manager this is an existing credential to
                 fill, not a new one to generate. */
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Sign in
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>

          {/* The one support route reachable without a session. A tester who
              cannot sign in has no other way to reach us. */}
          <SupportLink
            label="Trouble signing in?"
            subject={SUPPORT_SUBJECTS.signIn}
            className="text-center text-sm text-muted-foreground"
          />
        </CardFooter>
      </form>
    </Card>
  );
}

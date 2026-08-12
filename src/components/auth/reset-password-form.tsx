"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
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
  PASSWORD_MIN_LENGTH,
  describeAuthError,
  validatePassword,
} from "@/lib/auth-messages";

interface ResetPasswordFormProps {
  /**
   * False when the page loaded without a usable recovery session — an expired,
   * already-used or malformed link. Decided on the server so the user sees a
   * real explanation rather than a form that fails on submit.
   */
  hasRecoverySession: boolean;
}

export function ResetPasswordForm({
  hasRecoverySession,
}: ResetPasswordFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const problem = validatePassword(password, confirmation);
    if (problem) {
      toast.error(problem);
      return;
    }

    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(describeAuthError(error));
      setIsLoading(false);
      return;
    }

    /**
     * Sign out after a successful reset.
     *
     * The recovery session is a live session, so leaving it in place would let
     * whoever opened the link stay signed in without ever proving they know
     * the new password. Ending it and asking them to sign in properly is the
     * safer close — and it confirms the new password actually works.
     *
     * This touches the Supabase session only. Profile, workspace, projects and
     * connected integrations are untouched.
     */
    await supabase.auth.signOut();

    router.push("/login?notice=password_updated");
    router.refresh();
  }

  if (!hasRecoverySession) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Link expired</CardTitle>
          <CardDescription>
            This password reset link is no longer valid. Reset links expire
            after a short time and can only be used once.
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex flex-col gap-3">
          <Link
            href="/forgot-password"
            className={`w-full ${buttonVariants()}`}
          >
            Request a new link
          </Link>

          <p className="text-muted-foreground text-center text-sm">
            <Link href="/login" className="hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Set a new password</CardTitle>
        <CardDescription>
          Choose a new password for your account. You will sign in with it
          straight after.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              name="new-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            {/* A separate PasswordInput instance, so its reveal state is
                independent of the field above it. */}
            <PasswordInput
              id="confirm-password"
              name="confirm-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              disabled={isLoading}
            />
          </div>
        </CardContent>

        <CardFooter>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthNoticeBanner } from "@/components/auth/auth-notice-banner";

interface SignedInLinkErrorProps {
  notice: string;
}

/**
 * Shown when an already-signed-in user opens a broken auth link.
 *
 * A sign-in form would be nonsense here — they have a valid session, and the
 * problem is the link, not their access. Their session is deliberately left
 * alone: the failed link says nothing about whether the session they already
 * hold is legitimate, so destroying it would punish the wrong thing.
 */
export function SignedInLinkError({ notice }: SignedInLinkErrorProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <CardTitle className="text-2xl font-bold">Link no longer valid</CardTitle>

        {/* Resolves the fragment too, which is where Supabase puts its own
            reason and which the server cannot see. */}
        <AuthNoticeBanner serverNotice={notice} />

        <CardDescription>
          You are still signed in, so nothing has changed about your account.
        </CardDescription>
      </CardHeader>

      <CardFooter className="flex flex-col gap-3">
        <Link href="/dashboard" className={`w-full ${buttonVariants()}`}>
          Back to dashboard
        </Link>

        <p className="text-muted-foreground text-center text-sm">
          <Link href="/forgot-password" className="hover:underline">
            Request a new password reset link
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

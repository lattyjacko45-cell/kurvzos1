import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportLink } from "@/components/support-link";
import { SUPPORT_SUBJECTS } from "@/lib/beta";

/**
 * Shown at /signup while the private beta flag is on.
 *
 * This is the UX layer only. The actual gate is Supabase's "Allow new users to
 * sign up" setting, which refuses the request at the API — a `NEXT_PUBLIC_`
 * flag is compiled into the browser bundle and could be flipped by anyone with
 * devtools.
 *
 * What this genuinely buys is honesty: without it, an uninvited visitor gets a
 * working-looking form that fails with a generic error. With it, they are told
 * why, and given somewhere to go.
 *
 * The signup form is not rendered at all here, so `signUp()` cannot be
 * submitted from this state.
 */
export function InviteOnlyNotice() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          KurvzOS is in private beta
        </CardTitle>
        <CardDescription>
          Accounts are currently available by invitation only. If you have been
          invited, check your email for your invitation link.
        </CardDescription>
      </CardHeader>

      <CardFooter className="flex flex-col gap-3">
        <Link href="/login" className={`w-full ${buttonVariants()}`}>
          Sign in
        </Link>

        <SupportLink
          label="Think you should have access?"
          subject={SUPPORT_SUBJECTS.general}
          className="text-center text-sm text-muted-foreground"
        />

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:underline">
            Terms of Use
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

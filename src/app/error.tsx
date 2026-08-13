"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportLink } from "@/components/support-link";

/**
 * The route-level error boundary.
 *
 * Before this existed, any unhandled server error — a Prisma fault, an
 * integration read that threw past its own handling, an executive engine
 * failure — produced Next's default error screen: no KurvzOS chrome, no
 * navigation, and nothing a beta tester could do except close the tab.
 *
 * Nothing about the error reaches the screen. Not the message, not the stack,
 * not the digest. Next already redacts server error messages in production,
 * but this component runs in the browser and would happily render whatever it
 * was handed, so the omission is deliberate rather than inherited.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /**
     * The digest only — never `error.message` or `error.stack`.
     *
     * A Prisma or provider message can carry query parameters, addresses or
     * connection details. The digest is an opaque hash Next also writes to the
     * server log, which makes it the one value that correlates the two without
     * carrying anything sensitive.
     */
    console.error("[kurvzos] route error", { digest: error.digest ?? null });
  }, [error.digest]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            Something went wrong
          </CardTitle>
          <CardDescription>
            This page could not load. It is usually temporary — trying again
            often works.
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex flex-col gap-3">
          {/* Re-renders the segment without a full reload, so unsaved state
              elsewhere on the page survives where possible. */}
          <Button type="button" className="w-full" onClick={reset}>
            Try again
          </Button>

          <Link
            href="/dashboard"
            className={`w-full ${buttonVariants({ variant: "outline" })}`}
          >
            Back to dashboard
          </Link>

          <SupportLink
            label="Still stuck?"
            className="text-center text-sm text-muted-foreground"
          />
        </CardFooter>
      </Card>
    </div>
  );
}

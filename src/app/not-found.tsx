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
import { siteConfig } from "@/config/site";

/**
 * The KurvzOS 404.
 *
 * Reached by a mistyped URL, a stale bookmark, or a `notFound()` from a route
 * such as `/content/[contentId]` when the id does not belong to the signed-in
 * profile. That last case matters: a content item the user does not own is
 * deliberately a 404 rather than a 403, so this page must not imply the thing
 * exists somewhere else.
 *
 * Polish rather than protection — the isolation is enforced in the query, not
 * here.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
          <span className="font-bold text-primary-foreground">K</span>
        </div>

        <span className="text-xl font-semibold">{siteConfig.name}</span>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Page not found</CardTitle>
          <CardDescription>
            We could not find that page. It may have been moved, or the link may
            be out of date.
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex flex-col gap-3">
          <Link href="/dashboard" className={`w-full ${buttonVariants()}`}>
            Back to dashboard
          </Link>

          <SupportLink className="text-center text-sm text-muted-foreground" />
        </CardFooter>
      </Card>
    </div>
  );
}

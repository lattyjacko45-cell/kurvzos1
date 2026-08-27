import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isLinkFailureNotice } from "@/lib/auth-messages";
import {
  AUTH_CHECK_TIMEOUT_MS,
  classifyRoute,
  decideMiddlewareAction,
  getUserWithTimeout,
  hasSupabaseAuthCookie,
} from "@/lib/supabase/auth-check";

/**
 * The auth check did not produce a confirmed authenticated/unauthenticated
 * answer in time. Identifiers only — never a token, cookie value, or session
 * payload.
 */
function logAuthCheckFallback(
  status: "timeout" | "error",
  pathname: string
): void {
  console.warn("[middleware] auth check did not complete", {
    status,
    pathname,
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;
  const { isAuthRoute, isProtectedRoute } = classifyRoute(pathname);

  // No session cookie at all: there is nothing to validate, so a protected
  // route redirects immediately without ever calling `getUser`.
  const hasCookie = hasSupabaseAuthCookie(
    request.cookies.getAll().map((cookie) => cookie.name)
  );

  // A cookie is present but unconfirmed (timeout or thrown error) is
  // deliberately NOT treated as authenticated or unauthenticated here — see
  // `decideMiddlewareAction`. The dashboard layout's own `getCurrentUser()`
  // call remains the real, revalidated authorization gate.
  const outcome = hasCookie
    ? await getUserWithTimeout(
        () => supabase.auth.getUser(),
        AUTH_CHECK_TIMEOUT_MS
      )
    : null;

  if (outcome && outcome.status !== "ok") {
    logAuthCheckFallback(outcome.status, pathname);
  }

  /**
   * A failed auth link must be explained, even to someone already signed in.
   *
   * This rule used to fire unconditionally, and `nextUrl.clone()` carries the
   * query string with it — so `/login?error=link_expired` became
   * `/dashboard?error=link_expired`. The callback had correctly detected the
   * reused recovery link, and the redirect then threw the explanation away and
   * dumped the user on a dashboard that said nothing about it.
   *
   * Only link failures hold someone here. Routine notices — signed out,
   * password updated — still bounce an authenticated user to the dashboard,
   * because those are not problems to solve.
   */
  const noticeParam =
    request.nextUrl.searchParams.get("error") ??
    request.nextUrl.searchParams.get("notice") ??
    undefined;

  const action = decideMiddlewareAction({
    hasCookie,
    outcome,
    isAuthRoute,
    isProtectedRoute,
    isLinkFailure: isLinkFailureNotice(noticeParam),
  });

  if (action.type === "redirect-login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Path only — never the query string, which could carry anything.
    // The login page re-validates this against the app origin regardless.
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (action.type === "redirect-dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    // Drop the auth-page query so it cannot ride along onto the dashboard.
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isLinkFailureNotice } from "@/lib/auth-messages";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  /**
   * Signed-in users are bounced off these.
   *
   * `/reset-password` is deliberately absent: a live recovery session IS an
   * authenticated session, so treating it as an auth route would redirect the
   * user to the dashboard before they could set a password. It is absent from
   * the protected list too, so an expired link reaches the page and gets a
   * real explanation instead of a silent bounce to /login.
   */
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password");

  /**
   * Every signed-in surface. `/inbox` and `/drive` were missing — they arrived
   * with the Gmail and Drive milestones and were never added here, so the
   * middleware guard did not cover them. Their pages redirect on their own, so
   * nothing leaked, but the edge guard is the layer that is supposed to catch
   * this first.
   */
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/focus") ||
    pathname.startsWith("/ceo-packet") ||
    pathname.startsWith("/feedback") ||
    pathname.startsWith("/content") ||
    pathname.startsWith("/executive-team") ||
    pathname.startsWith("/inbox") ||
    pathname.startsWith("/drive");

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Path only — never the query string, which could carry anything.
    // The login page re-validates this against the app origin regardless.
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
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

  if (user && isAuthRoute && !isLinkFailureNotice(noticeParam)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    // Drop the auth-page query so it cannot ride along onto the dashboard.
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

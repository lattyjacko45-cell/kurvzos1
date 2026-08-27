/**
 * Framework-agnostic pieces of the middleware auth check.
 *
 * Split out of `middleware.ts` so the decision logic can be unit-tested
 * directly. `middleware.ts` imports `next/server` and `@supabase/ssr`, which
 * only resolve inside a real Next.js/edge runtime — Node's plain
 * `--experimental-strip-types --test` runner cannot execute that outside of
 * Next itself. Nothing here imports `next/server`, `@supabase/ssr`, or any
 * `@/` path alias, so it runs under the project's existing test convention
 * with no extra tooling. `middleware.ts` is the only caller.
 */

/**
 * How long `supabase.auth.getUser()` is allowed to run before its result is
 * treated as unknown rather than awaited further.
 *
 * Chosen to be comfortably shorter than Vercel's Edge Middleware execution
 * budget, so a stalled auth check can never itself become the reason the
 * middleware invocation times out.
 */
export const AUTH_CHECK_TIMEOUT_MS = 5000;

export type AuthCheckOutcome<TUser> =
  | { status: "ok"; user: TUser | null }
  | { status: "timeout" }
  | { status: "error" };

/**
 * Whether the request carries a Supabase session cookie, without asking
 * Supabase whether it is still valid.
 *
 * This is what lets an anonymous visit to a protected route redirect
 * immediately: there is nothing to validate, so there is nothing to wait on.
 * Supabase's SSR client names its session cookie `sb-<project-ref>-auth-token`
 * and chunks large payloads into `.0`, `.1`, ... suffixes, so this matches on
 * prefix rather than an exact name.
 */
export function hasSupabaseAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => /^sb-.+-auth-token/.test(name));
}

/**
 * Runs `getUser` with a hard ceiling, collapsing a throw into the same
 * `"error"` outcome a timeout produces.
 *
 * The race is deliberate: a `getUser()` that eventually settles after the
 * timeout has already lost — its result is never read, so it cannot flip
 * which branch the caller took. Both `check` and `timeout` are plain
 * promises with no cleanup to race against here.
 */
export async function getUserWithTimeout<TUser>(
  getUser: () => Promise<{ data: { user: TUser | null } }>,
  timeoutMs: number
): Promise<AuthCheckOutcome<TUser>> {
  const timeout = new Promise<AuthCheckOutcome<TUser>>((resolve) => {
    setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });

  const check = (async (): Promise<AuthCheckOutcome<TUser>> => {
    try {
      const {
        data: { user },
      } = await getUser();
      return { status: "ok", user };
    } catch {
      return { status: "error" };
    }
  })();

  return Promise.race([check, timeout]);
}

export interface RouteClassification {
  isAuthRoute: boolean;
  isProtectedRoute: boolean;
}

export function classifyRoute(pathname: string): RouteClassification {
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

  return { isAuthRoute, isProtectedRoute };
}

export type MiddlewareAction =
  | { type: "redirect-login" }
  | { type: "redirect-dashboard" }
  | { type: "continue" };

/**
 * Decides what middleware should do, given only what it was able to confirm.
 *
 * The two branches that matter for beta reliability:
 *  - No cookie at all: there is no session to validate, so a protected route
 *    redirects to /login without ever calling `getUser`.
 *  - A cookie is present but the check did not complete (`outcome` is a
 *    timeout or an error, or was never run): the user is deliberately NOT
 *    classified as authenticated OR unauthenticated. Redirecting to /login
 *    here would log out a real session on a slow network; the request is
 *    allowed to continue so the dashboard layout's own `getCurrentUser()`
 *    call — a real, revalidated check — is the one that decides.
 */
export function decideMiddlewareAction(input: {
  hasCookie: boolean;
  outcome: AuthCheckOutcome<unknown> | null;
  isAuthRoute: boolean;
  isProtectedRoute: boolean;
  isLinkFailure: boolean;
}): MiddlewareAction {
  const { hasCookie, outcome, isAuthRoute, isProtectedRoute, isLinkFailure } =
    input;

  if (!hasCookie) {
    return isProtectedRoute ? { type: "redirect-login" } : { type: "continue" };
  }

  if (!outcome || outcome.status !== "ok") {
    return { type: "continue" };
  }

  const isAuthenticated = outcome.user !== null;

  if (!isAuthenticated && isProtectedRoute) {
    return { type: "redirect-login" };
  }

  /**
   * A failed auth link must be explained, even to someone already signed in.
   * Routine notices — signed out, password updated — still bounce an
   * authenticated user to the dashboard, because those are not problems to
   * solve.
   */
  if (isAuthenticated && isAuthRoute && !isLinkFailure) {
    return { type: "redirect-dashboard" };
  }

  return { type: "continue" };
}

/**
 * Auth messaging, validation and outcome detection.
 *
 * Deliberately dependency-free — no Supabase, no Next, no `@/` alias — so the
 * branch tests run directly under Node's type stripping. The forms hold the
 * network calls; the decisions live here where they can be tested.
 *
 * One rule governs this file: a beta user never sees a raw provider string.
 * Supabase's own messages leak implementation detail ("AuthApiError", "Email
 * not confirmed", rate-limit internals) and change without notice, so every
 * outcome is mapped onto copy we control.
 */

// ---------------------------------------------------------------------------
// Password rules
// ---------------------------------------------------------------------------

/**
 * Matches Supabase's own default minimum. Set deliberately rather than
 * inherited: if the project raises its requirement, this is the one place to
 * change so the client-side message and the server rule stay in step.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePassword(
  password: string,
  confirmation: string
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (password !== confirmation) {
    return "Those passwords do not match.";
  }

  return null;
}

/**
 * Input type and control label for a password field.
 *
 * Pure so the two invariants that actually matter can be asserted without a
 * DOM: the field is `password` unless explicitly revealed, and the control
 * describes the action it performs rather than the current state.
 */
export function passwordFieldState(isVisible: boolean): {
  type: "text" | "password";
  toggleLabel: string;
} {
  return {
    type: isVisible ? "text" : "password",
    toggleLabel: isVisible ? "Hide password" : "Show password",
  };
}

// ---------------------------------------------------------------------------
// Provider errors → copy we control
// ---------------------------------------------------------------------------

/** Fixed identifiers we are willing to put in a URL and show a user. */
export type AuthNotice =
  | "auth_callback_error"
  | "link_expired"
  | "link_invalid"
  | "recovery_expired"
  | "signed_out"
  | "password_updated"
  | "email_confirmed";

export const AUTH_NOTICES: Record<AuthNotice, string> = {
  auth_callback_error:
    "That sign-in link could not be completed. Please sign in again.",
  link_expired:
    "That link has expired. Links are single-use and time-limited — request a new one below.",
  link_invalid:
    "That link is not valid. It may have been altered or already used.",
  recovery_expired:
    "That password reset link has expired. Request a new one below.",
  signed_out: "You have been signed out.",
  password_updated: "Password updated. Sign in with your new password.",
  email_confirmed: "Email confirmed. You can sign in now.",
};

/** Guards a query parameter before it indexes the notice map. */
export function isAuthNotice(value: string | undefined): value is AuthNotice {
  return Boolean(
    value && Object.prototype.hasOwnProperty.call(AUTH_NOTICES, value)
  );
}

/** Notices that describe a broken auth link rather than a routine outcome. */
const LINK_FAILURE_NOTICES: readonly AuthNotice[] = [
  "auth_callback_error",
  "link_expired",
  "link_invalid",
  "recovery_expired",
];

/**
 * Whether a notice means "this link did not work".
 *
 * Middleware uses this to decide when NOT to sweep an already-authenticated
 * user onto the dashboard. Routine notices — signed out, password updated —
 * are not link failures and should not hold anyone on the login page.
 */
export function isLinkFailureNotice(value: string | undefined): boolean {
  return isAuthNotice(value) && LINK_FAILURE_NOTICES.includes(value);
}

/**
 * Maps a provider error identifier onto our notice vocabulary.
 *
 * Shared by the callback route (which reads query parameters) and the client
 * fragment reader (which reads the hash), so both describe the same failure
 * the same way. Nothing from `description` is ever shown — it is only matched
 * against, because Supabase's descriptions are free text.
 */
export function noticeForProviderError(
  errorCode: string | null | undefined,
  description?: string | null
): AuthNotice {
  const haystack = `${errorCode ?? ""} ${description ?? ""}`.toLowerCase();

  if (haystack.includes("expired") || haystack.includes("otp_expired")) {
    return "link_expired";
  }

  // access_denied on a recovery link almost always means already-used.
  if (haystack.includes("access_denied")) return "link_expired";

  if (haystack.includes("invalid") || haystack.includes("bad_code")) {
    return "link_invalid";
  }

  return "auth_callback_error";
}

/**
 * Reads an auth failure out of a URL fragment.
 *
 * Supabase reports a refused link by appending `#error=access_denied&
 * error_code=otp_expired&...` to the redirect. Fragments never reach the
 * server — they are not sent in the HTTP request — so this has to run in the
 * browser. Returns null when the fragment carries no auth error, which is the
 * overwhelmingly common case.
 */
export function parseAuthErrorFragment(
  hash: string | null | undefined
): AuthNotice | null {
  if (!hash) return null;

  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }

  const errorCode = params.get("error_code");
  const error = params.get("error");
  if (!errorCode && !error) return null;

  return noticeForProviderError(
    errorCode ?? error,
    params.get("error_description")
  );
}

/**
 * Supabase error identifiers we recognise, mapped onto our own copy.
 *
 * Keyed on `code` where Supabase provides one, falling back to a lowercased
 * substring match on the message — Supabase has not populated `code` on every
 * error historically, and an unrecognised error must still produce something
 * a nontechnical user can act on.
 */
const KNOWN_AUTH_ERRORS: Array<{ match: string; message: string }> = [
  {
    match: "invalid_credentials",
    message: "That email or password is not correct.",
  },
  {
    match: "invalid login credentials",
    message: "That email or password is not correct.",
  },
  {
    match: "email_not_confirmed",
    message:
      "Please confirm your email first. Check your inbox for the confirmation link.",
  },
  {
    match: "email not confirmed",
    message:
      "Please confirm your email first. Check your inbox for the confirmation link.",
  },
  {
    match: "over_email_send_rate_limit",
    message:
      "Too many emails requested. Wait a few minutes before trying again.",
  },
  {
    match: "over_request_rate_limit",
    message: "Too many attempts. Wait a few minutes before trying again.",
  },
  {
    match: "rate limit",
    message: "Too many attempts. Wait a few minutes before trying again.",
  },
  {
    match: "weak_password",
    message: `That password is too weak. Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  },
  {
    match: "same_password",
    message: "That is already your current password. Choose a different one.",
  },
  /*
   * There is deliberately NO entry for user_already_exists here.
   *
   * Mapping it produced "An account already exists for that email." — a
   * working account-enumeration oracle: submit an address, read the toast.
   * Duplicate signups are intercepted before this map by
   * `isDuplicateSignupError` and routed to the ambiguous confirmation screen.
   * If one ever reaches here anyway, the generic fallback is the safe answer.
   */
  {
    match: "otp_expired",
    message: "That link has expired. Request a new one.",
  },
  {
    match: "session_not_found",
    message: "Your session has expired. Please sign in again.",
  },
  {
    match: "validation_failed",
    message: "Please check the details you entered and try again.",
  },
];

const GENERIC_AUTH_ERROR =
  "Something went wrong. Please try again, or reset your password if the problem continues.";

/**
 * Turns a Supabase error into copy we are happy to show.
 *
 * Never returns the provider's own string. Anything unrecognised collapses to
 * a generic message — an unmapped error is exactly the case where the raw text
 * is most likely to be noise or to leak internals.
 */
export function describeAuthError(error: unknown): string {
  if (!error || typeof error !== "object") return GENERIC_AUTH_ERROR;

  const code = (error as { code?: unknown }).code;
  const rawMessage = (error as { message?: unknown }).message;

  const haystack = [
    typeof code === "string" ? code : "",
    typeof rawMessage === "string" ? rawMessage : "",
  ]
    .join(" ")
    .toLowerCase();

  if (!haystack.trim()) return GENERIC_AUTH_ERROR;

  for (const entry of KNOWN_AUTH_ERRORS) {
    if (haystack.includes(entry.match)) return entry.message;
  }

  return GENERIC_AUTH_ERROR;
}

// ---------------------------------------------------------------------------
// Signup outcome
// ---------------------------------------------------------------------------

export type SignupOutcome =
  /** A session exists — email confirmation is off, the user is signed in. */
  | "signed_in"
  /** No session, but a genuinely new identity — confirmation email sent. */
  | "confirmation_required"
  /** Supabase's obfuscated response for an address that already exists. */
  | "already_registered";

/** The subset of Supabase's signUp response this decision needs. */
export interface SignupResponseLike {
  session: unknown;
  user: { identities?: unknown[] | null } | null;
}

/**
 * Whether a failed `signUp()` failed because the address is already taken.
 *
 * Supabase reports duplicates two different ways depending on configuration:
 *  - Email confirmation ON — no error at all; a decoy user with empty
 *    `identities`, handled by `describeSignupOutcome`.
 *  - Email confirmation OFF — a real error, `user_already_exists` /
 *    "User already registered".
 *
 * The second path was missed, and the error message was rendered straight into
 * a toast. That turned signup into an enumeration oracle: submit an address,
 * read whether it exists. Callers must route a true result to the same
 * ambiguous screen a new signup gets, never to an error.
 */
export function isDuplicateSignupError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;

  const haystack = [
    typeof code === "string" ? code : "",
    typeof message === "string" ? message : "",
  ]
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("user_already_exists") ||
    haystack.includes("already registered") ||
    haystack.includes("already been registered")
  );
}

/**
 * Classifies a successful `signUp()` call.
 *
 * The important case is `already_registered`. With email confirmation enabled,
 * Supabase deliberately does NOT error when the address is taken — it returns
 * a decoy user with an empty `identities` array so an attacker cannot probe
 * which addresses exist. The previous signup form treated that as success,
 * announced "Account created!", and pushed the user at the dashboard, where
 * middleware bounced them back to login with no explanation.
 *
 * Detecting it lets us show a useful next action while still never confirming
 * to the *user* that the address is registered — see `SIGNUP_MESSAGES`.
 */
export function describeSignupOutcome(
  response: SignupResponseLike
): SignupOutcome {
  if (response.session) return "signed_in";

  const identities = response.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return "already_registered";
  }

  return "confirmation_required";
}

/**
 * What the user is told for each outcome.
 *
 * `already_registered` is deliberately worded so it reads identically to a
 * successful signup that requires confirmation. Someone probing for valid
 * addresses learns nothing; the real owner of the address gets a message that
 * still points them somewhere useful.
 */
/**
 * The one message shown whenever signup does not produce a session.
 *
 * Shared by `confirmation_required` and `already_registered` — the same object,
 * not two similar ones — so the two cases are byte-for-byte identical on
 * screen. Earlier they shared a heading but had different bodies, which still
 * let a prober tell them apart.
 *
 * The wording promises nothing about the address: it does not say a link was
 * sent, only what to do next in either case.
 */
const AMBIGUOUS_SIGNUP_MESSAGE = {
  title: "Check your email",
  body: "If that address can be used to sign up, you'll receive instructions shortly. If you already have an account, sign in or reset your password.",
} as const;

export const SIGNUP_MESSAGES: Record<
  SignupOutcome,
  { title: string; body: string }
> = {
  signed_in: {
    title: "Account created",
    body: "Setting up your workspace…",
  },
  confirmation_required: AMBIGUOUS_SIGNUP_MESSAGE,
  already_registered: AMBIGUOUS_SIGNUP_MESSAGE,
};

// ---------------------------------------------------------------------------
// Redirect construction
// ---------------------------------------------------------------------------

/**
 * Builds an absolute URL for Supabase to send the user back to.
 *
 * Always routed through `/auth/callback` because this app uses `@supabase/ssr`,
 * which means the PKCE flow: the emailed link carries a `code` that must be
 * exchanged for a session on the server before any page can trust it. Pointing
 * a link straight at `/reset-password` would land the user there with no
 * session at all.
 *
 * `next` is a fixed in-app path chosen by the caller, never user input.
 */
export function buildAuthRedirectUrl(origin: string, next: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

const DEFAULT_AUTH_REDIRECT = "/dashboard";

/**
 * Accept only a same-origin HTTP(S) destination and return its local path.
 *
 * Parsing first is important: browser URL normalization treats backslashes as
 * slashes, so prefix checks such as `startsWith("/")` are not sufficient.
 */
export function safeInternalRedirect(
  candidate: string | null,
  origin: string,
  fallback = DEFAULT_AUTH_REDIRECT
): string {
  if (!candidate) return fallback;

  try {
    const base = new URL(origin);
    const destination = new URL(candidate, base);

    if (
      destination.origin !== base.origin ||
      (destination.protocol !== "http:" && destination.protocol !== "https:")
    ) {
      return fallback;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

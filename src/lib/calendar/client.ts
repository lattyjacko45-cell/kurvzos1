import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  CALENDAR_API_BASE,
  CALENDAR_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  getCalendarRedirectUri,
  requireCalendarEnv,
} from "@/lib/calendar/config";

/**
 * Google Calendar access — read only.
 *
 * There is no write path in this module by construction: no POST, PATCH, PUT or
 * DELETE against a calendar resource exists here, so no code path can create,
 * edit or delete an event.
 *
 * Privacy is enforced at the boundary. `normalizeEvent` is the only way an
 * event leaves this file, and it copies a fixed allowlist of fields. Attendees,
 * organizer, description, conference and hangout links, and attachments are
 * never read out of the payload at all.
 */

export class CalendarApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "CalendarApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

/** Only Google's short identifier — never a body or a message. */
function readGoogleErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const top = (payload as { error?: unknown }).error;
  if (typeof top === "string") return top;

  if (top && typeof top === "object") {
    const { status, errors } = top as {
      status?: unknown;
      errors?: Array<{ reason?: unknown }>;
    };

    const reason = errors?.[0]?.reason;
    if (typeof reason === "string") return reason;
    if (typeof status === "string") return status;
  }

  return undefined;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export function buildCalendarAuthorizationUrl(state: string): string {
  const env = requireCalendarEnv();

  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: getCalendarRedirectUri(env.appUrl),
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    // Incremental authorization: keeps previously granted scopes (YouTube)
    // attached to the account rather than replacing them.
    include_granted_scopes: "true",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function postForm(
  url: string,
  body: Record<string, string>
): Promise<GoogleTokenResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);

    throw new CalendarApiError(
      "Google rejected the token request.",
      response.status,
      readGoogleErrorCode(payload)
    );
  }

  return (await response.json()) as GoogleTokenResponse;
}

export async function exchangeCalendarCode(
  code: string
): Promise<GoogleTokenResponse> {
  const env = requireCalendarEnv();

  return postForm(GOOGLE_TOKEN_URL, {
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: getCalendarRedirectUri(env.appUrl),
    grant_type: "authorization_code",
  });
}

/** Fresh access token from the stored Calendar refresh token. */
export async function getCalendarAccessToken(
  profileId: string
): Promise<string> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { profileId },
    select: { encryptedRefreshToken: true },
  });

  if (!connection) {
    throw new CalendarApiError("No calendar is connected.", 428);
  }

  const env = requireCalendarEnv();
  const refreshToken = decryptSecret(connection.encryptedRefreshToken);

  try {
    const tokens = await postForm(GOOGLE_TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
    });

    return tokens.access_token;
  } catch {
    throw new CalendarApiError(
      "Your calendar authorization has expired. Reconnect Google Calendar.",
      401
    );
  }
}

/** The only event shape allowed out of this module. */
export interface NormalizedEvent {
  title: string;
  /** ISO instant for timed events; YYYY-MM-DD for all-day. */
  start: string;
  end: string;
  allDay: boolean;
  status: string;
  location: string | null;
}

export interface CalendarReadResult {
  events: NormalizedEvent[];
  timeZone: string;
}

/**
 * Copies only the allowlisted fields. Attendees, organizer, description,
 * hangoutLink, conferenceData and attachments are never touched.
 */
function normalizeEvent(raw: {
  summary?: string;
  status?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}): NormalizedEvent | null {
  const startValue = raw.start?.dateTime ?? raw.start?.date;
  const endValue = raw.end?.dateTime ?? raw.end?.date;
  if (!startValue || !endValue) return null;

  return {
    title: raw.summary?.trim() || "Busy",
    start: startValue,
    end: endValue,
    allDay: Boolean(raw.start?.date && !raw.start?.dateTime),
    status: raw.status ?? "confirmed",
    location: raw.location?.trim() || null,
  };
}

/**
 * Upcoming events from the primary calendar, using Google's documented
 * pattern for an upcoming-events list.
 */
export async function listUpcomingEvents(
  accessToken: string,
  now: Date = new Date(),
  maxResults = 20
): Promise<CalendarReadResult> {
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
  });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);

    throw new CalendarApiError(
      "Could not read the calendar.",
      response.status,
      readGoogleErrorCode(payload)
    );
  }

  const payload = (await response.json()) as {
    timeZone?: string;
    items?: Array<Parameters<typeof normalizeEvent>[0]>;
  };

  const events = (payload.items ?? [])
    .map(normalizeEvent)
    .filter((event): event is NormalizedEvent => event !== null)
    // Cancelled events can still appear in some responses.
    .filter((event) => event.status !== "cancelled");

  return { events, timeZone: payload.timeZone ?? "UTC" };
}

/** Primary calendar's label and timezone, for the connection card. */
export async function fetchPrimaryCalendarSummary(
  accessToken: string
): Promise<{ label: string; timeZone: string }> {
  // events.readonly does not grant calendarList access, so the label comes
  // from the events response instead of a separate calendars.get call.
  const result = await listUpcomingEvents(accessToken, new Date(), 1);

  return { label: "Primary calendar", timeZone: result.timeZone };
}

/*
 * There is deliberately no revoke helper in this module.
 *
 * Google treats the incremental grants for this project as one combined
 * authorization, so revoking the Calendar token would also drop the YouTube
 * scopes. Disconnecting Calendar is a local operation — see
 * /api/calendar/disconnect. Provider-side revocation, if it is ever wanted,
 * must be a separate explicit action that disconnects both integrations.
 */

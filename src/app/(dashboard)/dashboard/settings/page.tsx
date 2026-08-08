import type { Metadata } from "next";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCalendarOAuthSetupDetails,
  getCalendarSetupState,
} from "@/lib/calendar/config";
import { getScheduleForProfile } from "@/lib/calendar/read.server";
import {
  CalendarConnectionCard,
  type CalendarConnectionState,
} from "@/components/calendar/calendar-connection-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Settings",
};

function getInitials(name?: string | null, email?: string) {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.slice(0, 2).toUpperCase() ?? "U";
}

const CALENDAR_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected.",
  denied: "Calendar access was declined.",
  invalid: "That connection attempt expired. Please try again.",
  failed: "Could not finish connecting Google Calendar.",
  no_refresh_token:
    "Google did not return a refresh token. Remove KurvzOS at myaccount.google.com/permissions, then connect again.",
};

interface SettingsPageProps {
  searchParams: Promise<{ calendar?: string }>;
}

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  const { calendar } = await searchParams;
  const calendarMessage = calendar ? CALENDAR_MESSAGES[calendar] : undefined;
  const calendarSetup = getCalendarSetupState();

  const calendarConnection = await prisma.calendarConnection.findUnique({
    where: { profileId: profile.id },
    select: { calendarLabel: true, calendarTimeZone: true },
  });

  // Uses the cached read, so opening Settings does not hammer Google.
  const schedule = calendarConnection
    ? await getScheduleForProfile(profile.id)
    : null;

  const calendarState: CalendarConnectionState = !calendarConnection
    ? "not_connected"
    : schedule?.state === "reconnect_required"
      ? "reconnect_required"
      : schedule?.state === "error"
        ? "error"
        : "connected";

  return (
    <div className="mx-auto w-full max-w-focused space-y-8">
      <div>
        <h1 className="font-serif text-display-lg">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected apps</CardTitle>
          <CardDescription>
            Services KurvzOS reads from. Each is authorised separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {calendarMessage ? (
            <p role="status" className="rounded-2xl border p-3 text-sm">
              {calendarMessage}
            </p>
          ) : null}

          <CalendarConnectionCard
            configured={calendarSetup.configured}
            missingEnv={calendarSetup.missing}
            state={calendarState}
            calendarLabel={calendarConnection?.calendarLabel ?? null}
            timeZone={calendarConnection?.calendarTimeZone ?? null}
            oauthSetup={getCalendarOAuthSetupDetails()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarFallback className="text-lg">
                {getInitials(profile.fullName, profile.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">
                {profile.fullName ?? "User"}
              </p>
              <p className="text-muted-foreground text-sm">{profile.email}</p>
            </div>
          </div>
          <Separator />
          <dl className="grid gap-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Full name</dt>
              <dd className="font-medium">{profile.fullName ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{profile.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-medium">
                {profile.createdAt.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Your workspace configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Workspace settings and team management will be available in a future
            update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

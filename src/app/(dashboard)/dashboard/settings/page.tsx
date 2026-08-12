import type { Metadata } from "next";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
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
import { PageHeader } from "@/components/ui/page-header";

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

  // Provisions on first visit if this is a brand-new account, and is
  // request-cached alongside the dashboard's own lookup.
  const workspace = await getUserWorkspace(profile.id);

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
      {/*
        The hand-rolled heading is replaced by the shared PageHeader so this
        page uses the same title treatment as every other route. Title and
        description are the existing strings, unchanged. No eyebrow is passed:
        this page never had one, and inventing a label would be new copy.
      */}
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />

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
          {/* Muted label left, value right and emphasised. items-baseline and
              gap keep long values aligned instead of colliding when they wrap
              on a narrow screen. */}
          <dl className="grid gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Full name</dt>
              <dd className="text-right font-medium">
                {profile.fullName ?? "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-right font-medium">{profile.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-right font-medium">
                {profile.createdAt.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Connected services, below account information. */}
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

          {/* Google Calendar is the only service shown on Settings. The
              YouTube card lives on the Content routes and is untouched. */}
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

      {/* Supporting information last: this card holds a future-availability
          notice rather than any setting, so it sits below the real ones. */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Your workspace configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* A beta user needs to be able to see which workspace they are in
              before any of the rest of this page makes sense. */}
          <dl className="grid gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="text-right font-medium">{workspace.name}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="text-right font-medium">Owner</dd>
            </div>
          </dl>

          <p className="text-muted-foreground text-sm">
            Renaming workspaces and inviting team members will be available in a
            future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

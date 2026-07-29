import type { Metadata } from "next";

import { getCurrentUser, ensureProfile } from "@/lib/auth";
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

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and preferences.
        </p>
      </div>

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

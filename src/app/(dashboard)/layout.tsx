import { redirect } from "next/navigation";

import {
  getCurrentUser,
  ensureProfile,
  getUserWorkspace,
} from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  await getUserWorkspace(profile.id);

  return (
    <div className="flex min-h-screen">
      <DashboardShell user={user}>{children}</DashboardShell>
    </div>
  );
}

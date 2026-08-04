import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser, ensureProfile, getUserWorkspace } from "@/lib/auth";
import { getWeeklyPacket } from "@/lib/weekly-packet.server";
import { formatWeekRange, NO_ACTIVITY } from "@/lib/weekly-packet";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "CEO Packet",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  COMPLETED: "Completed",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-1">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>

      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

export default async function CeoPacketPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(
    user.id,
    user.email,
    user.fullName ?? undefined
  );
  const workspace = await getUserWorkspace(profile.id);
  const packet = await getWeeklyPacket(workspace.id);

  const { priorityTask, priorityProgress, results, projects, risks } = packet;
  const activeProjects = projects.filter(
    (project) => project.status === "ACTIVE"
  );

  return (
    <article className="mx-auto w-full max-w-4xl space-y-10 print:max-w-none">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Weekly CEO Packet
        </p>

        <h1 className="text-4xl font-bold tracking-tight">
          {formatWeekRange(packet.range)}
        </h1>

        <p className="text-muted-foreground">{workspace.name}</p>
      </header>

      <Separator />

      <section className="space-y-4">
        <SectionHeading>Weekly Priority</SectionHeading>

        {priorityTask ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-2xl font-semibold tracking-tight">
                {priorityTask.title}
              </p>

              <p className="text-sm text-muted-foreground">
                {priorityTask.projectName} · {priorityTask.priority} priority
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Current Step
                </p>

                <p className="text-sm font-medium">
                  {priorityProgress.currentStep?.title ??
                    (priorityProgress.hasSteps
                      ? "All steps complete"
                      : "No checklist yet")}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Progress
                  </p>

                  <p className="text-sm font-semibold tabular-nums">
                    {priorityProgress.completedCount} /{" "}
                    {priorityProgress.totalSteps}
                  </p>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted print:border">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${priorityProgress.percent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No actionable task this week.
          </p>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <SectionHeading>Weekly Results</SectionHeading>

        {packet.hasWeeklyActivity ? (
          <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Completed" value={results.completedThisWeek} />
            <Stat label="Still Open" value={results.stillOpen} />
            <Stat label="Overdue" value={results.overdue} />
            <Stat label="Focus Minutes" value={results.focusMinutes} />
            <Stat label="Focus Sessions" value={results.focusSessions} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{NO_ACTIVITY}</p>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <SectionHeading>Project Activity</SectionHeading>

        {activeProjects.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Project
                </th>
                <th className="py-2 pr-4 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Open
                </th>
                <th className="py-2 pr-4 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Completed
                </th>
                <th className="py-2 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {activeProjects.map((project) => (
                <tr key={project.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{project.name}</td>
                  <td className="py-3 pr-4 tabular-nums">{project.openTasks}</td>
                  <td className="py-3 pr-4 tabular-nums">
                    {project.completedThisWeek}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {STATUS_LABELS[project.status] ?? project.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No active projects.</p>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <SectionHeading>Risks</SectionHeading>

        {risks.length > 0 ? (
          <ul className="space-y-3">
            {risks.map((risk, index) => (
              <li
                key={`${risk.kind}-${risk.title}-${index}`}
                className="space-y-1 border-l-2 pl-4"
              >
                <p className="text-sm font-medium">{risk.title}</p>
                <p className="text-sm text-muted-foreground">{risk.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No risks detected.</p>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <SectionHeading>Next Recommended Move</SectionHeading>

        <p className="text-lg font-medium leading-7">{packet.nextMove}</p>
      </section>
    </article>
  );
}

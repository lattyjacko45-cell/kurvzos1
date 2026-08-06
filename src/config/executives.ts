/**
 * The executive roster. Only Harper is active in this milestone; the rest are
 * listed so the workspace shape is visible, and so adding one later is a config
 * change plus a page, not a redesign.
 */

export interface ExecutiveProfile {
  id: "HARPER" | "RENEE" | "SOPHIA" | "OLIVIA" | "MARCUS";
  name: string;
  role: string;
  description: string;
  href: string | null;
  active: boolean;
}

export const EXECUTIVES: readonly ExecutiveProfile[] = [
  {
    id: "HARPER",
    name: "Harper",
    role: "Chief of Staff",
    description:
      "Reviews your workspace and tells you the one thing to do next.",
    href: "/executive-team/harper",
    active: true,
  },
  {
    id: "RENEE",
    name: "Renee",
    role: "Chief Business Strategist",
    description:
      "Judges whether current work supports the business outcome you want.",
    href: "/executive-team/renee",
    active: true,
  },
  {
    id: "SOPHIA",
    name: "Sophia",
    role: "Chief Marketing Officer",
    description:
      "Decides what to publish, promote or improve to grow the audience.",
    href: "/executive-team/sophia",
    active: true,
  },
  {
    id: "OLIVIA",
    name: "Olivia",
    role: "Operations Lead",
    description: "Watches capacity, workload and delivery risk.",
    href: null,
    active: false,
  },
  {
    id: "MARCUS",
    name: "Marcus",
    role: "Growth Advisor",
    description: "Reads performance and recommends where to push next.",
    href: null,
    active: false,
  },
] as const;

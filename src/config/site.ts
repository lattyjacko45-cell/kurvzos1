export const siteConfig = {
  name: "KurvzOS",
  description:
    "The operating system for modern teams. Manage projects, tasks, and workflows in one unified workspace.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  links: {
    github: "https://github.com/kurvzos/kurvzos",
    docs: "/docs",
  },
} as const;

/**
 * Sidebar navigation, grouped by intent rather than listed flat.
 *
 * Seven equal-weight items gave no sense of what the product is for. The
 * grouping says it: command the day, do the work, take advice, review.
 */
export interface NavItem {
  title: string;
  href: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const navGroups: readonly NavGroup[] = [
  {
    label: "Command",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    ],
  },
  {
    label: "Work",
    items: [
      { title: "Projects", href: "/dashboard/projects", icon: "FolderKanban" },
      { title: "Tasks", href: "/dashboard/tasks", icon: "CheckSquare" },
      { title: "Content", href: "/content", icon: "Clapperboard" },
    ],
  },
  /**
   * Surfaces backed by an external account rather than KurvzOS's own data.
   *
   * Kept separate from Work so it stays obvious which screens depend on a
   * third-party connection — and so Calendar and any future integration have
   * an established home rather than being appended to a generic group.
   */
  {
    label: "Connected Workspace",
    items: [
      { title: "Inbox", href: "/inbox", icon: "Mail" },
      { title: "Drive", href: "/drive", icon: "HardDrive" },
    ],
  },
  {
    label: "Advisory",
    items: [
      { title: "Executive Team", href: "/executive-team", icon: "Users" },
      /**
       * Harper's Morning Brief. Kept beside Executive Team rather than under
       * Command or Connected Workspace — it is Harper's read of Gmail,
       * Calendar and KurvzOS priorities together, not a KurvzOS-only view or
       * a raw integration screen.
       */
      { title: "Morning Brief", href: "/morning-brief", icon: "Sunrise" },
    ],
  },
  {
    label: "Review",
    items: [{ title: "CEO Packet", href: "/ceo-packet", icon: "FileText" }],
  },
];

/**
 * Utility destinations. Rendered below the labelled groups and deliberately
 * outside them — Settings is not part of the review workflow.
 */
export const navUtilityItems: readonly NavItem[] = [
  { title: "Settings", href: "/dashboard/settings", icon: "Settings" },
];

/** Flat list retained for any consumer that needs every destination. */
export const navItems: readonly NavItem[] = [
  ...navGroups.flatMap((group) => group.items),
  ...navUtilityItems,
];

export const features = [
  {
    title: "Unified Workspace",
    description:
      "Bring projects, tasks, and team collaboration into a single operating environment.",
    icon: "Layers",
  },
  {
    title: "Real-time Sync",
    description:
      "Stay aligned with live updates powered by Supabase and instant data synchronization.",
    icon: "Zap",
  },
  {
    title: "Smart Workflows",
    description:
      "Organize work with projects, priorities, and status tracking built for velocity.",
    icon: "GitBranch",
  },
  {
    title: "Enterprise Ready",
    description:
      "Role-based access, secure authentication, and scalable infrastructure from day one.",
    icon: "Shield",
  },
] as const;

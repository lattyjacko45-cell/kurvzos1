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

export const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { title: "Projects", href: "/dashboard/projects", icon: "FolderKanban" },
  { title: "Tasks", href: "/dashboard/tasks", icon: "CheckSquare" },
  { title: "Executive Team", href: "/executive-team", icon: "Users" },
  { title: "Content", href: "/content", icon: "Clapperboard" },
  { title: "CEO Packet", href: "/ceo-packet", icon: "FileText" },
  { title: "Settings", href: "/dashboard/settings", icon: "Settings" },
] as const;

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

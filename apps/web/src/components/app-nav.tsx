import Link from "next/link";
import {
  Briefcase,
  Compass,
  House,
  Search,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AppNavPath =
  "home" | "matches" | "jobs" | "pathways" | "applications" | "profile";

export const APP_NAV_ITEMS: ReadonlyArray<{
  path: AppNavPath;
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { path: "home", href: "/home", label: "Home", icon: House },
  { path: "matches", href: "/matches", label: "Matches", icon: Target },
  { path: "jobs", href: "/jobs", label: "Search jobs", icon: Search },
  { path: "pathways", href: "/pathways", label: "Pathways", icon: Compass },
  {
    path: "applications",
    href: "/applications",
    label: "Applications",
    icon: Briefcase,
  },
  {
    path: "profile",
    href: "/profile",
    label: "Career profile",
    icon: UserRound,
  },
];

export function NavLink({
  item,
  active,
}: {
  item: (typeof APP_NAV_ITEMS)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "bg-sidebar-accent font-medium text-foreground"
          : "text-ink-secondary hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn(
          "size-4 shrink-0 transition-colors duration-150",
          active
            ? "text-foreground"
            : "text-ink-faint group-hover:text-ink-secondary",
        )}
      />
      {item.label}
    </Link>
  );
}

export function DataModeLine({
  dataMode,
}: {
  dataMode: "supabase" | "fixtures";
}) {
  return (
    <p className="flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          dataMode === "fixtures" ? "bg-warning" : "bg-success",
        )}
      />
      {dataMode === "fixtures" ? "Development data" : "Live UK listings"}
    </p>
  );
}

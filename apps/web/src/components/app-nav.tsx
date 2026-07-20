"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Compass,
  House,
  LifeBuoy,
  Search,
  Settings,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AppNavPath =
  | "home"
  | "matches"
  | "jobs"
  | "pathways"
  | "applications"
  | "profile"
  | "settings"
  | "support";

type NavItem = {
  path: AppNavPath;
  href: string;
  label: string;
  icon: LucideIcon;
};

export const APP_NAV_ITEMS: ReadonlyArray<NavItem> = [
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

/** The quiet utility items that live at the bottom of the rail. */
export const APP_NAV_FOOTER_ITEMS: ReadonlyArray<NavItem> = [
  { path: "settings", href: "/settings", label: "Settings", icon: Settings },
  { path: "support", href: "/support", label: "Support", icon: LifeBuoy },
];

/**
 * Active state comes from the URL, so the rail can live in the layout and
 * stay mounted across navigations instead of re-rendering with every page.
 * Tests (and any caller outside the router) may pass `activePath` directly.
 */
function useActivePath(override?: AppNavPath): AppNavPath | null {
  // Returns null outside the app router (component tests), which is fine:
  // tests that care pass `override` explicitly.
  const pathname = usePathname();
  if (override) return override;
  if (!pathname) return null;
  const match = [...APP_NAV_ITEMS, ...APP_NAV_FOOTER_ITEMS]
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .toSorted((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.path;
  // Detail routes belong to the surface that lists them.
  if (pathname.startsWith("/tailor")) return "jobs";
  return null;
}

export function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-[var(--rail-item-padding)] text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
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

export function PrimaryNav({
  activePath,
  label = "Primary",
}: {
  activePath?: AppNavPath;
  label?: string;
}) {
  const active = useActivePath(activePath);
  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-[var(--rail-gap)] px-3"
    >
      {APP_NAV_ITEMS.map((item) => (
        <NavLink key={item.path} item={item} active={active === item.path} />
      ))}
    </nav>
  );
}

export function FooterNav({
  activePath,
  label = "Utility",
}: {
  activePath?: AppNavPath;
  label?: string;
}) {
  const active = useActivePath(activePath);
  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-[var(--rail-gap)] px-3"
    >
      {APP_NAV_FOOTER_ITEMS.map((item) => (
        <NavLink key={item.path} item={item} active={active === item.path} />
      ))}
    </nav>
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

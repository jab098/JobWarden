"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileClock,
  HeartPulse,
  Import,
  Rss,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Administration as a section *inside* the hub, not a second product.
 *
 * `/admin` lives under `(protected)`, so the hub shell is already rendered
 * around it. `AdminShell` used to render a second rail, a second brand block
 * and a second sign-out inside that shell, on its own background — which is why
 * entering administration read as leaving JobWarden. That component is now kept
 * only for `/development/admin-preview`, which genuinely is standalone and has
 * no hub around it.
 *
 * Here the hub rail stays where it is, Admin stays lit in it, and the five
 * operational surfaces become a secondary nav in the content column, using the
 * same container, spacing and colour as every other hub page.
 */
const links: ReadonlyArray<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: "/admin/access", label: "Access", icon: UserCheck },
  { href: "/admin/sources", label: "Sources", icon: Rss },
  { href: "/admin/ingestion", label: "Ingestion", icon: Import },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
  { href: "/admin/audit", label: "Audit", icon: FileClock },
];

export function AdminSection({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    // The same container every hub page uses, so the working column does not
    // change width or padding when a reader crosses into administration.
    <div className="mx-auto max-w-page px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Admin
        </h1>
        <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-secondary">
          Operations for the private beta: who gets in, where jobs come from,
          and what the runtime has been doing. Every figure here is derived from
          records JobWarden already holds.
        </p>
      </header>

      {/* A horizontal section nav rather than a rail. A second vertical rail
          beside the hub's own would read as a second application; a row of
          tabs reads as one page with sections, which is what this is. */}
      <nav
        aria-label="Administration"
        className="mt-5 flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {links.map((link) => {
          const Icon = link.icon;
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-(--duration-quick) focus-visible:ring-2 focus-visible:ring-ring/60",
                active
                  ? "bg-surface-sunken font-medium text-foreground"
                  : "text-ink-secondary hover:bg-surface-sunken/60 hover:text-foreground",
              )}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={1.75}
                className={cn(
                  "size-4 shrink-0 transition-colors duration-(--duration-quick)",
                  active
                    ? "text-foreground"
                    : "text-ink-faint group-hover:text-ink-secondary",
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">{children}</div>
    </div>
  );
}

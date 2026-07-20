import Link from "next/link";
import {
  FileClock,
  HeartPulse,
  Import,
  Rss,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

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

function AdminNavigation({
  label,
  preview,
}: {
  label: string;
  preview: boolean;
}) {
  return (
    <nav aria-label={label} className="flex gap-0.5 lg:block lg:space-y-0.5">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={preview ? `#${link.label.toLowerCase()}` : link.href}
            className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-ink-secondary transition-colors duration-150 outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Icon
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-4 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-ink-secondary"
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  children,
  preview = false,
}: Readonly<{
  children: React.ReactNode;
  preview?: boolean;
}>) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-background text-foreground">
      {preview ? (
        <p className="sticky top-0 z-40 border-b border-border bg-surface-sunken px-5 py-2 text-center text-xs font-medium break-words text-ink-secondary">
          Read-only fictional administrator preview; no administrator access
          granted
        </p>
      ) : null}
      <header className="border-b border-border px-5 py-4 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={preview ? "/development/admin-preview" : "/admin/access"}
            className="rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            JobWarden administration
          </Link>
          {!preview ? <SignOutButton /> : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <AdminNavigation label="Administrator mobile" preview={preview} />
        </div>
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="px-5 pt-5 pb-4">
          <Link
            href={preview ? "/development/admin-preview" : "/admin/access"}
            className="rounded-md text-[0.95rem] font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            JobWarden
          </Link>
          <p className="mt-0.5 text-xs text-ink-faint">
            Private beta operations
          </p>
        </div>
        <div className="px-3">
          <AdminNavigation label="Administrator primary" preview={preview} />
        </div>
        <div className="mt-auto border-t border-sidebar-border px-5 py-4">
          <p className="flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${preview ? "bg-warning" : "bg-success"}`}
            />
            {preview ? "Fictional preview" : "Administrator"}
          </p>
          {!preview ? (
            <div className="mt-3">
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </aside>
      <div className="w-full min-w-0 max-w-full overflow-x-clip lg:pl-56">
        {children}
      </div>
    </div>
  );
}

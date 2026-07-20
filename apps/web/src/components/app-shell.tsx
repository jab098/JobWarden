import Link from "next/link";

import {
  APP_NAV_ITEMS,
  DataModeLine,
  NavLink,
  type AppNavPath,
} from "@/components/app-nav";
import { MobileNavigation } from "@/components/mobile-navigation";

export type { AppNavPath };

export function AppShell({
  children,
  dataMode,
  activePath = "home",
}: Readonly<{
  children: React.ReactNode;
  dataMode: "supabase" | "fixtures";
  activePath?: AppNavPath;
}>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <Link
          href="/home"
          className="rounded-md text-[0.95rem] font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          JobWarden
        </Link>
        <MobileNavigation dataMode={dataMode} activePath={activePath} />
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 pt-5 pb-4">
          <Link
            href="/home"
            className="rounded-md text-[0.95rem] font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            JobWarden
          </Link>
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3">
          {APP_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              active={activePath === item.path}
            />
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-5 py-4">
          <DataModeLine dataMode={dataMode} />
        </div>
      </aside>
      <main className="min-w-0 lg:pl-56">{children}</main>
    </div>
  );
}

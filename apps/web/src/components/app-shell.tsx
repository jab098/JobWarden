import Link from "next/link";
import { LogOut } from "lucide-react";

import {
  DataModeLine,
  FooterNav,
  PrimaryNav,
  type AppNavPath,
} from "@/components/app-nav";
import { MobileNavigation } from "@/components/mobile-navigation";
import { signOut } from "@/app/auth/sign-in/actions";

export type { AppNavPath };

/**
 * The persistent workspace frame. It renders once from the protected layout
 * and stays mounted across navigations; only the content column changes, so
 * the rail never blinks and route loading states appear inside the frame.
 */
export function AppShell({
  children,
  dataMode,
  activePath,
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
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--rail-width)] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 pt-5 pb-4">
          <Link
            href="/home"
            className="font-display rounded-md text-[0.95rem] font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            JobWarden
          </Link>
        </div>
        <PrimaryNav activePath={activePath} />
        <div className="mt-auto flex flex-col gap-3 pb-4">
          <FooterNav activePath={activePath} />
          <div className="border-t border-sidebar-border px-3 pt-3">
            <form action={signOut}>
              <button
                type="submit"
                className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-[var(--rail-item-padding)] text-sm text-ink-secondary transition-colors duration-150 outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <LogOut
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-4 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-ink-secondary"
                />
                Sign out
              </button>
            </form>
            <div className="px-2.5 pt-3">
              <DataModeLine dataMode={dataMode} />
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 lg:pl-[var(--rail-width)]">{children}</main>
    </div>
  );
}

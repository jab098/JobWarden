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
  adminHref,
}: Readonly<{
  children: React.ReactNode;
  dataMode: "supabase" | "fixtures";
  activePath?: AppNavPath;
  /**
   * Server-decided destination for the Admin rail item, or null for a reader
   * who is not an administrator. Passed down rather than derived here: whether
   * somebody is an administrator is not a question a client component may
   * answer, and `requireAdmin` on the route remains the real boundary.
   */
  adminHref?: string | null;
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
        <MobileNavigation
          dataMode={dataMode}
          activePath={activePath}
          adminHref={adminHref}
        />
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--rail-width)] flex-col bg-sidebar lg:flex">
        <div className="px-3 pt-3 pb-4">
          {/* Boxed rather than floating on the rail: the brand is a distinct
              object, not a heading sitting on the same colour as everything
              around it. */}
          <Link
            href="/home"
            className="font-display flex items-center rounded-lg border border-border bg-workspace px-3 py-2.5 text-[0.95rem] font-semibold tracking-[-0.02em] shadow-[0_1px_2px_rgba(16,20,28,0.04)] outline-none transition-colors duration-(--duration-quick) hover:border-input focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            JobWarden
          </Link>
        </div>
        <PrimaryNav activePath={activePath} />
        <div className="mt-auto flex flex-col gap-3 pb-4">
          <FooterNav activePath={activePath} adminHref={adminHref} />
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
      {/* The working surface is white and the rail around it is grey, so a card
          is visible as a lighter object on the page rather than needing its
          shadow to be found. */}
      <main className="min-w-0 lg:pl-[var(--rail-width)]">
        {/* Arriving at the hub blurs into focus once. This element belongs to
            the shell, which the layout renders once and keeps across
            navigations, so the entrance runs on the first paint of the product
            and never again while moving between `/home`, `/matches`, `/jobs`
            and the rest — those get the route-level fade and rise instead. */}
        <div className="page-enter-blur min-h-[100dvh] bg-workspace lg:rounded-tl-xl lg:border-l lg:border-border">
          {children}
        </div>
      </main>
    </div>
  );
}

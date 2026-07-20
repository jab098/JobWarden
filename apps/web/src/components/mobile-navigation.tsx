"use client";

import { Menu } from "lucide-react";

import {
  DataModeLine,
  FooterNav,
  PrimaryNav,
  type AppNavPath,
} from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNavigation({
  dataMode,
  activePath,
  adminHref,
}: {
  dataMode: "supabase" | "fixtures";
  activePath?: AppNavPath;
  /** Server-decided; see `AppShell`. Mirrors the rail so the two agree. */
  adminHref?: string | null;
}) {
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Open navigation" />
          }
        >
          <Menu aria-hidden="true" strokeWidth={1.75} />
        </SheetTrigger>
        <SheetContent
          side="left"
          aria-label="JobWarden navigation"
          className="flex w-[min(19rem,85vw)] flex-col border-border bg-sidebar p-0"
        >
          <SheetHeader className="px-5 pt-5 pb-4">
            <SheetTitle className="font-display text-[0.95rem] font-semibold tracking-[-0.02em] text-foreground">
              JobWarden navigation
            </SheetTitle>
            <SheetDescription className="sr-only">
              UK jobs workspace
            </SheetDescription>
          </SheetHeader>
          <PrimaryNav activePath={activePath} />
          <div className="mt-auto flex flex-col gap-3 pb-4">
            <FooterNav
              activePath={activePath}
              label="Utility mobile"
              adminHref={adminHref}
            />
            <div className="border-t border-border px-5 pt-3">
              <DataModeLine dataMode={dataMode} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

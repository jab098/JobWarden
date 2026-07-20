"use client";

import { Menu } from "lucide-react";

import {
  APP_NAV_ITEMS,
  DataModeLine,
  NavLink,
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
}: {
  dataMode: "supabase" | "fixtures";
  activePath: AppNavPath;
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
            <SheetTitle className="text-[0.95rem] font-semibold tracking-[-0.02em] text-foreground">
              JobWarden navigation
            </SheetTitle>
            <SheetDescription className="sr-only">
              UK jobs workspace
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3">
            {APP_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                item={item}
                active={activePath === item.path}
              />
            ))}
          </nav>
          <div className="mt-auto border-t border-border px-5 py-4">
            <DataModeLine dataMode={dataMode} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

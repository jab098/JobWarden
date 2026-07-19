"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

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
  activePath: "jobs" | "explore" | "applications" | "profile";
}) {
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label="Open navigation"
              className="focus-visible:ring-2 focus-visible:ring-[#2458a6]"
            />
          }
        >
          <Menu aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="left"
          aria-label="JobWarden navigation"
          className="w-[min(21rem,88vw)] border-[#d8d4cb] bg-[#f4f1ea] p-0"
        >
          <SheetHeader className="border-b border-[#d8d4cb] px-6 py-5">
            <SheetTitle className="text-lg font-semibold text-[#172033]">
              JobWarden navigation
            </SheetTitle>
            <SheetDescription className="text-[#596173]">
              UK jobs workspace
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Primary" className="p-4">
            <Link
              href="/jobs"
              aria-current={activePath === "jobs" ? "page" : undefined}
              className={`block rounded-md px-4 py-3 text-sm font-medium text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${activePath === "jobs" ? "bg-white shadow-[inset_3px_0_0_#2458a6]" : "text-[#596173]"}`}
            >
              Jobs
            </Link>
            <Link
              href="/explore"
              aria-current={activePath === "explore" ? "page" : undefined}
              className={`mt-1 block rounded-md px-4 py-3 text-sm font-medium text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${activePath === "explore" ? "bg-white shadow-[inset_3px_0_0_#2458a6]" : "text-[#596173]"}`}
            >
              Explore
            </Link>
            <Link
              href="/applications"
              aria-current={activePath === "applications" ? "page" : undefined}
              className={`mt-1 block rounded-md px-4 py-3 text-sm font-medium text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${activePath === "applications" ? "bg-white shadow-[inset_3px_0_0_#2458a6]" : "text-[#596173]"}`}
            >
              Applications
            </Link>
            <Link
              href="/profile"
              aria-current={activePath === "profile" ? "page" : undefined}
              className={`mt-1 block rounded-md px-4 py-3 text-sm font-medium text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${activePath === "profile" ? "bg-white shadow-[inset_3px_0_0_#2458a6]" : "text-[#596173]"}`}
            >
              Career profile
            </Link>
          </nav>
          <p className="mt-auto border-t border-[#d8d4cb] px-6 py-5 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#596173]">
            {dataMode === "fixtures" ? "Development data" : "Live UK listings"}
          </p>
        </SheetContent>
      </Sheet>
    </div>
  );
}

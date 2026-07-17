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
}: {
  dataMode: "supabase" | "fixtures";
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
              className="block rounded-md bg-white px-4 py-3 text-sm font-medium text-[#172033] shadow-[inset_3px_0_0_#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
            >
              Jobs
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

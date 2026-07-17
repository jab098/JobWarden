import Link from "next/link";

import { MobileNavigation } from "@/components/mobile-navigation";

export function AppShell({
  children,
  dataMode,
}: Readonly<{
  children: React.ReactNode;
  dataMode: "supabase" | "fixtures";
}>) {
  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#172033]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#d8d4cb] bg-[#f4f1ea]/95 px-5 backdrop-blur lg:hidden">
        <Link href="/jobs" className="font-semibold tracking-[-0.02em]">
          JobWarden
        </Link>
        <MobileNavigation dataMode={dataMode} />
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col border-r border-[#d8d4cb] bg-[#f4f1ea] lg:flex">
        <div className="border-b border-[#d8d4cb] px-6 py-6">
          <Link
            href="/jobs"
            className="text-lg font-semibold tracking-[-0.025em]"
          >
            JobWarden
          </Link>
          <p className="mt-1 text-xs text-[#697181]">UK jobs workspace</p>
        </div>
        <nav aria-label="Primary" className="p-3">
          <Link
            href="/jobs"
            className="block rounded-md bg-white px-4 py-3 text-sm font-medium shadow-[inset_3px_0_0_#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
          >
            Jobs
          </Link>
        </nav>
        <p className="mt-auto border-t border-[#d8d4cb] px-6 py-5 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
          {dataMode === "fixtures" ? "Development data" : "Live UK listings"}
        </p>
      </aside>
      <main className="min-w-0 lg:pl-52">{children}</main>
    </div>
  );
}

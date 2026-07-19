import { Check, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type WorkspaceHoldingViewProps = {
  signOutAction: () => void | Promise<void>;
};

export function WorkspaceHoldingView({
  signOutAction,
}: WorkspaceHoldingViewProps) {
  return (
    <main className="min-h-screen bg-[#f4f1ea] px-5 py-6 text-[#172033] sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between border-b border-[#d8d2c7] pb-5">
          <Link href="/home" className="text-sm font-semibold">
            JobWarden
          </Link>
          <form action={signOutAction}>
            <Button variant="ghost" type="submit" className="rounded-md">
              Sign out
            </Button>
          </form>
        </header>

        <section className="grid flex-1 content-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end lg:gap-24">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-[#2f6f4e]">
              <Check aria-hidden="true" className="size-4" />
              Your access is active
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Jobs workspace
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#626b7a]">
              The protected destination is ready. The first UK jobs feed is
              being prepared with the same source and eligibility safeguards.
            </p>
          </div>

          <div className="border-t border-[#c8c1b5] pt-6">
            <Search aria-hidden="true" className="size-5 text-[#2458a6]" />
            <p className="mt-5 text-sm font-semibold">
              No placeholder listings
            </p>
            <p className="mt-2 text-sm leading-6 text-[#676f7f]">
              Job rows appear only after verified source data reaches the
              protected feed.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

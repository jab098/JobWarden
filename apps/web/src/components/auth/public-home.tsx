import { ArrowRight, Check, Search } from "lucide-react";
import Link from "next/link";

import { PublicFooter } from "@/components/legal/public-footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicHomeProps = {
  dataMode?: "fixtures";
};

export function PublicHome({ dataMode }: PublicHomeProps) {
  const isDevelopment = dataMode === "fixtures";

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f4f1ea] text-[#172033]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-8">
        <header className="flex items-center justify-between border-b border-[#d8d2c7] pb-5">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] focus-visible:ring-offset-4"
          >
            JobWarden
          </Link>
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[#596173]">
            {isDevelopment ? "Development data" : "UK private beta"}
          </span>
        </header>

        <div className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.7fr)] lg:gap-24 lg:py-24">
          <section aria-labelledby="home-title" className="min-w-0 max-w-3xl">
            <div className="mb-8 flex size-10 items-center justify-center rounded-md border border-[#c8c1b5] bg-[#faf8f3] text-[#2458a6]">
              <Search aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </div>
            <p className="mb-4 text-sm font-medium text-[#2458a6]">
              A calmer UK job search
            </p>
            <h1
              id="home-title"
              className="max-w-2xl text-4xl leading-[1.04] font-semibold tracking-[-0.045em] text-balance sm:text-6xl"
            >
              One place to watch UK work worth considering.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#596173] sm:text-lg sm:leading-8">
              JobWarden gathers permitted UK listings, including contract work,
              and keeps the evidence behind every classification visible.
              Applications stay in your hands on the employer&apos;s site.
            </p>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Link
                href={isDevelopment ? "/home" : "/auth/sign-in"}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 rounded-md bg-[#2458a6] px-5 text-white hover:bg-[#1d477f] focus-visible:ring-[#2458a6]/40",
                )}
              >
                {isDevelopment ? "Open jobs workspace" : "Request access"}
                <ArrowRight aria-hidden="true" />
              </Link>
              <span className="text-sm text-[#596173]">
                {isDevelopment
                  ? "Explicitly fictional fixtures are enabled locally."
                  : "Every request is reviewed by the owner."}
              </span>
            </div>
          </section>

          <aside
            aria-label="How JobWarden works"
            className="min-w-0 border-t border-[#c8c1b5] lg:border-t-0 lg:border-l lg:pl-12"
          >
            {[
              [
                "Evidence first",
                "Only roles with explicit UK eligibility are published.",
              ],
              [
                "Contract aware",
                "Employment type, rate and IR35 stay unknown unless stated.",
              ],
              [
                "Manual applications",
                "Follow the original link; JobWarden never applies for you.",
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="grid grid-cols-[1.5rem_1fr] gap-4 border-b border-[#d8d2c7] py-6"
              >
                <Check
                  aria-hidden="true"
                  className="mt-1 size-4 text-[#2458a6]"
                  strokeWidth={2}
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#676f7f]">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </aside>
        </div>

        <PublicFooter />
      </div>
    </main>
  );
}

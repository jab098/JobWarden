import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { PublicFooter } from "@/components/legal/public-footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicHomeProps = {
  dataMode?: "fixtures";
};

const principles = [
  ["Evidence first", "Only roles with explicit UK eligibility are published."],
  [
    "Contract aware",
    "Employment type, rate and IR35 stay unknown unless stated.",
  ],
  [
    "Manual applications",
    "Follow the original link; JobWarden never applies for you.",
  ],
] as const;

export function PublicHome({ dataMode }: PublicHomeProps) {
  const isDevelopment = dataMode === "fixtures";

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-background text-foreground">
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-5 sm:px-8">
          <header className="flex items-center justify-between">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4"
            >
              JobWarden
            </Link>
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] text-ink-faint">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  isDevelopment ? "bg-warning" : "bg-success",
                )}
              />
              {isDevelopment ? "Development data" : "UK private beta"}
            </span>
          </header>

          <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-20">
            <section aria-labelledby="home-title" className="min-w-0">
              <h1
                id="home-title"
                className="text-5xl font-semibold tracking-[-0.045em] text-foreground sm:text-6xl"
              >
                JobWarden
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-ink-secondary">
                A private workspace for UK work worth considering, with the
                evidence behind every classification visible. Applications stay
                in your hands on the employer&apos;s site.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3.5">
                <Link
                  href={isDevelopment ? "/home" : "/auth/sign-in"}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-10 px-5 transition-[background-color,transform] duration-150 ease-(--ease-smooth-out) active:scale-[0.98]",
                  )}
                >
                  {isDevelopment ? "Open jobs workspace" : "Request access"}
                  <ArrowRight aria-hidden="true" />
                </Link>
                <span className="text-xs text-ink-faint">
                  {isDevelopment
                    ? "Explicitly fictional fixtures are enabled locally."
                    : "Every request is reviewed by the owner."}
                </span>
              </div>
              <ul className="mt-12 flex flex-col gap-4 border-t border-border pt-8">
                {principles.map(([title, body]) => (
                  <li key={title} className="flex items-start gap-2.5">
                    <Check
                      aria-hidden="true"
                      strokeWidth={2}
                      className="mt-0.5 size-3.5 shrink-0 text-success"
                    />
                    <p className="text-sm leading-6 text-ink-secondary">
                      <span className="font-medium text-foreground">
                        {title}.
                      </span>{" "}
                      {body}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <div
              className="relative hidden min-w-0 lg:block"
              aria-hidden="true"
            >
              {/* A real capture of the dashboard, resting at a soft card tilt
                  that eases flat on hover. Decorative: hidden from readers. */}
              {/* Hover binds to the flat wrapper, not the tilted card, so the
                  moving edges never slip out from under the cursor. */}
              <div className="group [perspective:1600px]">
                <div className="rounded-xl border border-border bg-card p-1.5 shadow-[0_32px_64px_-24px_rgba(16,20,28,0.28),0_8px_24px_-12px_rgba(16,20,28,0.14)] transition-transform duration-(--duration-slow) ease-(--ease-smooth-out) [transform:rotateX(6deg)_rotateY(-9deg)_rotateZ(1.5deg)] group-hover:[transform:rotateX(2deg)_rotateY(-3deg)_rotateZ(0.5deg)_translateY(-6px)]">
                  <Image
                    src="/dashboard-preview.png"
                    alt=""
                    width={1440}
                    height={900}
                    priority
                    className="rounded-lg border border-border"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <div className="mx-auto w-full max-w-6xl px-5 pb-5 sm:px-8">
        <PublicFooter />
      </div>
    </div>
  );
}

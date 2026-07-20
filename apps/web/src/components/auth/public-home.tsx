import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { AccessDialog } from "@/components/auth/access-dialog";
import { PublicFooter } from "@/components/legal/public-footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicHomeProps = {
  dataMode?: "fixtures";
  /** Passed in so the dialog can start Google sign-in without a page hop. */
  signInAction: () => Promise<void>;
  turnstileSiteKey: string | null;
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

export function PublicHome({
  dataMode,
  signInAction,
  turnstileSiteKey,
}: PublicHomeProps) {
  const isDevelopment = dataMode === "fixtures";

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-card text-foreground">
      <main className="flex flex-1 flex-col px-3 pt-3 sm:px-4 sm:pt-4">
        {/* The hero sits on its own tinted panel, Realm-style; the page
            around it stays white so the panel reads as the product. */}
        <div className="flex flex-1 flex-col rounded-xl bg-background">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-5 sm:px-8">
            <header className="flex items-center justify-between">
              <Link
                href="/"
                className="font-display rounded-md text-[0.95rem] font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4"
              >
                JobWarden
              </Link>
              <div className="flex items-center gap-2.5">
                <span className="mr-1 hidden items-center gap-1.5 font-mono text-[0.7rem] text-ink-faint sm:inline-flex">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      isDevelopment ? "bg-warning" : "bg-success",
                    )}
                  />
                  {isDevelopment ? "Development data" : "UK private beta"}
                </span>
                {isDevelopment ? null : (
                  <Link
                    href="/auth/sign-in"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "bg-card",
                    )}
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </header>

            <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14 lg:py-12">
              <section aria-labelledby="home-title" className="min-w-0">
                <h1
                  id="home-title"
                  className="text-5xl font-semibold tracking-[-0.045em] text-foreground sm:text-6xl"
                >
                  JobWarden
                </h1>
                <p className="mt-4 max-w-md text-base leading-7 text-ink-secondary">
                  We don&apos;t mass-apply. We find the few UK roles that
                  actually fit, and show you the evidence for each one.
                </p>
                <p className="mt-3 max-w-md text-sm leading-6 text-ink-faint">
                  Matches are scored against your real experience, your CV is
                  tailored honestly to each role, and every application is
                  tracked to its outcome. You apply yourself, on the
                  employer&apos;s own site.
                </p>
                <div className="mt-7 flex flex-col items-start gap-3">
                  {/* Locally the call to action walks the journey a real new
                      user takes, sign-up aside: onboarding, then Home in its
                      first-run state. That is the sequence worth reviewing, and
                      it cannot be reached from the populated preview. */}
                  {isDevelopment ? (
                    <Link
                      href="/development/journey"
                      className={cn(
                        buttonVariants({ size: "lg" }),
                        "h-10 px-5 transition-[background-color,transform] duration-150 ease-(--ease-smooth-out) active:scale-[0.98]",
                      )}
                    >
                      Walk the new-user journey
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  ) : (
                    <AccessDialog
                      signInAction={signInAction}
                      turnstileSiteKey={turnstileSiteKey}
                    >
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ size: "lg" }),
                          "h-10 px-5 transition-[background-color,transform] duration-150 ease-(--ease-smooth-out) active:scale-[0.98]",
                        )}
                      >
                        Request access
                        <ArrowRight aria-hidden="true" />
                      </button>
                    </AccessDialog>
                  )}
                  {isDevelopment ? (
                    <Link
                      href="/home"
                      className="rounded-sm text-sm font-medium text-link outline-none transition-colors duration-(--duration-quick) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      Skip to the populated workspace
                    </Link>
                  ) : null}
                  <span className="text-xs text-ink-faint">
                    {isDevelopment
                      ? "Explicitly fictional fixtures are enabled locally."
                      : "Every request is reviewed by the owner."}
                  </span>
                </div>
              </section>

              <div
                className="relative hidden min-w-0 lg:block"
                aria-hidden="true"
              >
                {/* A real capture of the dashboard, resting at a soft card
                    tilt that eases flat on hover. Hover binds to the flat
                    wrapper so the moving edges never slip under the cursor. */}
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
        </div>

        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <ul className="grid gap-x-8 gap-y-3 py-6 sm:grid-cols-3">
            {principles.map(([title, body]) => (
              <li key={title} className="flex items-start gap-2.5">
                <Check
                  aria-hidden="true"
                  strokeWidth={2}
                  className="mt-0.5 size-3.5 shrink-0 text-success"
                />
                <p className="text-sm leading-6 text-ink-secondary">
                  <span className="font-medium text-foreground">{title}.</span>{" "}
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <div className="mx-auto w-full max-w-6xl px-5 pb-5 sm:px-8">
        <PublicFooter />
      </div>
    </div>
  );
}

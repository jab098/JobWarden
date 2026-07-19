import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PublicFooter } from "@/components/legal/public-footer";
import { Button } from "@/components/ui/button";

type SignInViewProps = {
  action: () => void | Promise<void>;
  error?: string;
};

export function SignInView({ action, error }: SignInViewProps) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-[#f4f1ea] text-[#172033]">
      <main className="grid min-w-0 flex-1 lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
        <section className="min-w-0 flex flex-col justify-between border-b border-[#d8d2c7] p-6 lg:border-r lg:border-b-0 lg:p-10">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] focus-visible:ring-offset-4"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            JobWarden
          </Link>
          <p className="mt-12 hidden max-w-xs text-sm leading-6 text-[#676f7f] lg:block">
            Private access keeps the early dataset focused while source quality
            and UK eligibility rules are tested.
          </p>
        </section>

        <section className="min-w-0 flex items-center px-5 py-16 sm:px-10 lg:px-20">
          <div className="min-w-0 w-full max-w-md">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[#2458a6]">
              Private beta
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
              Sign in to JobWarden
            </h1>
            <p className="mt-4 max-w-sm text-base leading-7 text-[#676f7f]">
              Continue with Google to create or revisit your access request.
              Signing in alone does not unlock job data.
            </p>

            {error ? (
              <div
                role="alert"
                className="mt-7 flex items-start gap-2 rounded-md border border-[#e2ddd3] bg-white px-4 py-3 text-sm leading-6 text-[#7d2e29]"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#b4473d]"
                />
                We could not complete sign-in. Please try again.
              </div>
            ) : null}

            <form action={action} className="mt-8">
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full rounded-md bg-[#2458a6] text-white hover:bg-[#1d477f] focus-visible:ring-[#2458a6]/40"
              >
                <span aria-hidden="true" className="font-semibold">
                  G
                </span>
                Continue with Google
              </Button>
            </form>

            <p className="mt-6 text-xs leading-5 text-[#707786]">
              Access is granted manually. JobWarden does not use a purchase or
              automatic approval flow.
            </p>
          </div>
        </section>
      </main>
      <div className="px-6 pb-6 lg:px-10">
        <PublicFooter />
      </div>
    </div>
  );
}

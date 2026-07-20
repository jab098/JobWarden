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
    <div className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-clip bg-background text-foreground">
      <main className="grid min-w-0 flex-1 lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
        <section className="flex min-w-0 flex-col justify-between border-b border-border p-6 lg:border-r lg:border-b-0 lg:p-10">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4"
          >
            <ArrowLeft aria-hidden="true" className="size-4 text-ink-faint" />
            JobWarden
          </Link>
          <p className="mt-12 hidden max-w-xs text-sm leading-6 text-ink-secondary lg:block">
            Private access keeps the early dataset focused while source quality
            and UK eligibility rules are tested.
          </p>
        </section>

        <section className="flex min-w-0 items-center px-5 py-16 sm:px-10 lg:px-20">
          <div className="w-full min-w-0 max-w-md">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-success"
              />
              Private beta
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Sign in to JobWarden
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-7 text-ink-secondary">
              Continue with Google to create or revisit your access request.
              Signing in alone does not unlock job data.
            </p>

            {error ? (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-surface px-4 py-3 text-sm leading-6 text-danger"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-danger"
                />
                We could not complete sign-in. Please try again.
              </div>
            ) : null}

            <form action={action} className="mt-7">
              <Button
                type="submit"
                size="lg"
                className="h-10 w-full transition-[background-color,transform] duration-150 ease-(--ease-smooth-out) active:scale-[0.99]"
              >
                <span aria-hidden="true" className="font-semibold">
                  G
                </span>
                Continue with Google
              </Button>
            </form>

            <p className="mt-5 text-xs leading-5 text-ink-faint">
              Access is granted manually. JobWarden does not use a purchase or
              automatic approval flow.
            </p>
          </div>
        </section>
      </main>
      <div className="px-6 pb-5 lg:px-10">
        <PublicFooter />
      </div>
    </div>
  );
}

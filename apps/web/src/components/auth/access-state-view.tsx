import { Clock3, LockKeyhole, Pause, X } from "lucide-react";
import Link from "next/link";

import { PublicFooter } from "@/components/legal/public-footer";
import { Button } from "@/components/ui/button";

export type DisplayAccessStatus =
  "pending" | "rejected" | "suspended" | "closed";

const states = {
  pending: {
    eyebrow: "Access requested",
    title: "Request under review",
    body: "Your request is reviewed manually by the owner. You can return here after a decision has been made.",
    Icon: Clock3,
    colour: "text-warning",
    dot: "bg-warning",
  },
  rejected: {
    eyebrow: "Decision recorded",
    title: "Request not approved",
    body: "JobWarden is not available to this account. A decision reason is shown below when one was provided.",
    Icon: X,
    colour: "text-danger",
    dot: "bg-danger",
  },
  suspended: {
    eyebrow: "Account status",
    title: "Access is paused",
    body: "This account cannot open the jobs workspace while access is suspended. Contact the owner if you believe this is unexpected.",
    Icon: Pause,
    colour: "text-danger",
    dot: "bg-danger",
  },
  closed: {
    eyebrow: "Private beta",
    title: "Private beta is currently closed",
    body: "New requests are not being accepted, so no access request was created for this account. Existing approved users can still sign in.",
    Icon: LockKeyhole,
    colour: "text-ink-secondary",
    dot: "bg-ink-faint",
  },
} satisfies Record<
  DisplayAccessStatus,
  {
    eyebrow: string;
    title: string;
    body: string;
    Icon: typeof Clock3;
    colour: string;
    dot: string;
  }
>;

type AccessStateViewProps = {
  status: DisplayAccessStatus;
  reason?: string | null;
  signOutAction: () => void | Promise<void>;
};

export function AccessStateView({
  status,
  reason,
  signOutAction,
}: AccessStateViewProps) {
  const state = states[status];
  const StateIcon = state.Icon;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <main className="flex-1 px-5 py-5 sm:px-8">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl flex-col">
          <header className="flex items-center justify-between">
            <Link
              href="/"
              className="rounded-md text-sm font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4"
            >
              JobWarden
            </Link>
            <form action={signOutAction}>
              <Button variant="ghost" type="submit">
                Sign out
              </Button>
            </form>
          </header>

          <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)] lg:gap-20">
            <div>
              <p
                className={`inline-flex items-center gap-2 text-sm font-medium ${state.colour}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${state.dot}`}
                />
                {state.eyebrow}
              </p>
              <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em]">
                {state.title}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-ink-secondary">
                {state.body}
              </p>
            </div>

            <div className="card-surface p-6">
              <StateIcon
                aria-hidden="true"
                className={`size-5 ${state.colour}`}
                strokeWidth={1.75}
              />
              <h2 className="mt-5 text-sm font-semibold">What happens next</h2>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                {reason ||
                  (status === "pending"
                    ? "No action is needed while the request is reviewed."
                    : "This page will reflect any future access decision.")}
              </p>
            </div>
          </section>
        </div>
      </main>
      <div className="mx-auto w-full max-w-5xl px-5 pb-5 sm:px-8">
        <PublicFooter />
      </div>
    </div>
  );
}

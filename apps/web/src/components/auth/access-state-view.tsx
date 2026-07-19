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
    colour: "text-[#96651b]",
    surface: "bg-[#f7edda] border-[#dfc89f]",
  },
  rejected: {
    eyebrow: "Decision recorded",
    title: "Request not approved",
    body: "JobWarden is not available to this account. A decision reason is shown below when one was provided.",
    Icon: X,
    colour: "text-[#a23c35]",
    surface: "bg-[#f8eae6] border-[#e1bdb6]",
  },
  suspended: {
    eyebrow: "Account status",
    title: "Access is paused",
    body: "This account cannot open the jobs workspace while access is suspended. Contact the owner if you believe this is unexpected.",
    Icon: Pause,
    colour: "text-[#a23c35]",
    surface: "bg-[#f8eae6] border-[#e1bdb6]",
  },
  closed: {
    eyebrow: "Private beta",
    title: "Private beta is currently closed",
    body: "New requests are not being accepted, so no access request was created for this account. Existing approved users can still sign in.",
    Icon: LockKeyhole,
    colour: "text-[#536071]",
    surface: "bg-[#eceae5] border-[#d2cec5]",
  },
} satisfies Record<
  DisplayAccessStatus,
  {
    eyebrow: string;
    title: string;
    body: string;
    Icon: typeof Clock3;
    colour: string;
    surface: string;
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
    <div className="flex min-h-screen flex-col bg-[#f4f1ea] text-[#172033]">
      <main className="flex-1 px-5 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
          <header className="flex items-center justify-between border-b border-[#d8d2c7] pb-5">
            <Link
              href="/"
              className="text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] focus-visible:ring-offset-4"
            >
              JobWarden
            </Link>
            <form action={signOutAction}>
              <Button variant="ghost" type="submit" className="rounded-md">
                Sign out
              </Button>
            </form>
          </header>

          <section className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)] lg:gap-24">
            <div>
              <p className={`text-sm font-medium ${state.colour}`}>
                {state.eyebrow}
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                {state.title}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#626b7a]">
                {state.body}
              </p>
            </div>

            <div className={`border-t-2 p-6 sm:p-8 ${state.surface}`}>
              <StateIcon
                aria-hidden="true"
                className={`size-5 ${state.colour}`}
                strokeWidth={1.8}
              />
              <h2 className="mt-6 text-sm font-semibold">What happens next</h2>
              <p className="mt-3 text-sm leading-6 text-[#626b7a]">
                {reason ||
                  (status === "pending"
                    ? "No action is needed while the request is reviewed."
                    : "This page will reflect any future access decision.")}
              </p>
            </div>
          </section>
        </div>
      </main>
      <div className="px-5 pb-6 sm:px-8 lg:px-12">
        <PublicFooter />
      </div>
    </div>
  );
}

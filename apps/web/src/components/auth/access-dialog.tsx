"use client";

import { Dialog } from "@base-ui/react/dialog";
import Script from "next/script";
import { useActionState, useState } from "react";

import { joinEarlyAccessAction } from "@/app/auth/early-access/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  heardFromOptions,
  type EarlyAccessState,
} from "@/lib/early-access/types";
import { cn } from "@/lib/utils";

const initialState: EarlyAccessState = { kind: "idle" };

type Tab = "request" | "signin";

/**
 * The one door into JobWarden while it is invite-only: join the list, or sign
 * in if you already have an invite.
 *
 * The bot check is Cloudflare Turnstile. Without a configured site key the
 * widget cannot render, so the form says so and offers the sign-in tab rather
 * than presenting a submit button that the server would refuse anyway.
 */
export function AccessDialog({
  signInAction,
  turnstileSiteKey,
  children,
}: {
  signInAction: () => Promise<void>;
  turnstileSiteKey: string | null;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("request");
  const [state, action, pending] = useActionState(
    joinEarlyAccessAction,
    initialState,
  );
  const joined = state.kind === "success";

  return (
    <Dialog.Root>
      <Dialog.Trigger render={children as React.ReactElement} />
      <Dialog.Portal>
        {/* Both parts animate: the backdrop fades, the panel rises and settles.
            Base UI keeps them mounted through the exit so closing is not a
            disappearance. */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] transition-opacity duration-(--duration-fast) ease-(--ease-smooth-out) data-[closed]:opacity-0 data-[open]:opacity-100" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-workspace p-6 shadow-[var(--shadow-card-raised)] ring-1 ring-border transition-[opacity,transform] duration-(--duration-fast) ease-(--ease-smooth-out) outline-none data-[closed]:translate-y-[calc(-50%+10px)] data-[closed]:scale-[0.98] data-[closed]:opacity-0 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                Get access to JobWarden
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm leading-6 text-ink-secondary">
                JobWarden is invite-only while the UK private beta is being
                shaped. Join the early access list, or sign in if you have
                already been invited.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 text-ink-faint outline-none transition-colors duration-(--duration-quick) hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </div>

          <div
            role="tablist"
            aria-label="How to get in"
            className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            {(
              [
                ["request", "Request access"],
                ["signin", "Invited? Sign in"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-(--duration-quick) ease-(--ease-smooth-out) focus-visible:ring-2 focus-visible:ring-ring/60",
                  tab === id
                    ? "bg-workspace text-foreground shadow-[0_1px_2px_rgba(16,20,28,0.06)]"
                    : "text-ink-secondary hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "request" ? (
            <div className="page-fade mt-5">
              {joined ? (
                <p
                  role="status"
                  className="rounded-lg bg-success-surface px-4 py-3 text-sm leading-6 text-success"
                >
                  {state.message}
                </p>
              ) : (
                <>
                  <div className="rounded-lg bg-muted px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">
                      Sign ups are not open yet
                    </p>
                    <p className="mt-1 text-sm leading-6 text-ink-secondary">
                      People are being invited in deliberately while the core
                      workspace settles. Add yourself and we will use the list
                      to decide the next invites.
                    </p>
                  </div>

                  {turnstileSiteKey === null ? (
                    <p className="mt-4 text-sm leading-6 text-ink-secondary">
                      The early access list is not accepting entries yet. If you
                      already have an invite, sign in above.
                    </p>
                  ) : (
                    <form action={action} className="mt-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block space-y-1.5">
                          <span className="block text-sm font-medium">
                            Email
                          </span>
                          <Input
                            type="email"
                            name="email"
                            required
                            autoComplete="email"
                            placeholder="you@example.com"
                            className="bg-card"
                          />
                        </label>
                        <label className="block space-y-1.5">
                          <span className="block text-sm font-medium">
                            Name
                          </span>
                          <Input
                            name="name"
                            autoComplete="name"
                            placeholder="Optional"
                            className="bg-card"
                          />
                        </label>
                      </div>

                      <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">
                          What are you hoping JobWarden helps with?
                        </span>
                        <Textarea
                          name="hopingFor"
                          rows={3}
                          maxLength={1000}
                          placeholder="Optional: finding roles that fit, tailoring your CV, tracking applications"
                          className="bg-card"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="block text-sm font-medium">
                          How did you hear about JobWarden?
                        </span>
                        <span className="block text-xs text-ink-faint">
                          Optional. It tells us which channels actually work.
                        </span>
                        <select
                          name="heardFrom"
                          defaultValue=""
                          className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <option value="">Select one</option>
                          {heardFromOptions.map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div>
                        <div
                          className="cf-turnstile"
                          data-sitekey={turnstileSiteKey}
                          data-theme="light"
                        />
                        <p className="mt-1.5 text-xs text-ink-faint">
                          A quick check that keeps bots off the list.
                        </p>
                      </div>

                      {state.kind === "invalid" ||
                      state.kind === "unavailable" ? (
                        <p role="alert" className="text-sm text-danger">
                          {state.message}
                        </p>
                      ) : null}

                      <Button
                        type="submit"
                        disabled={pending}
                        className="w-full"
                      >
                        {pending ? "Adding you…" : "Join early access list"}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="page-fade mt-5 space-y-4">
              <p className="text-sm leading-6 text-ink-secondary">
                Sign in with the Google account your invite was sent to. If your
                account has not been approved yet you will land on a holding
                page rather than an error.
              </p>
              <form action={signInAction}>
                <button
                  type="submit"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-full gap-2.5 bg-card",
                  )}
                >
                  <GoogleMark />
                  Continue with Google
                </button>
              </form>
            </div>
          )}

          {turnstileSiteKey === null ? null : (
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js"
              strategy="lazyOnload"
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Google's mark, drawn rather than fetched so the dialog needs no CDN. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

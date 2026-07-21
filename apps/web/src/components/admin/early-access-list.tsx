"use client";

import { useActionState } from "react";

import { AdminStatus } from "./admin-status";
import { formatAdminDate } from "./admin-format";
import { Button } from "@/components/ui/button";
import type { AdminFormAction, EarlyAccessSignup } from "@/lib/admin/types";

const idleState = { kind: "idle" } as const;

const heardFromLabels: Record<string, string> = {
  search: "Search",
  social: "Social",
  friend: "A friend",
  community: "A community",
  newsletter: "A newsletter",
  other: "Somewhere else",
};

function InviteForm({
  signupId,
  action,
}: {
  signupId: string;
  action: AdminFormAction;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);

  return (
    <form action={formAction} className="min-w-0">
      <input type="hidden" name="signupId" value={signupId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Marking…" : "Mark invited"}
      </Button>
      {state.kind !== "idle" && "message" in state ? (
        <p
          role="status"
          className="mt-2 text-xs text-ink-secondary"
          // The live region has to exist before the message does, or a screen
          // reader never announces the first result.
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The waiting early-access queue.
 *
 * Read-mostly by design: the only mutation reachable from here is the invite
 * mark, and no product data appears at all — these people have no account, so
 * there is nothing of theirs to show beyond what they typed into the dialog.
 *
 * Everything a stranger wrote is rendered as text. React escapes it, and no
 * branch here sets HTML from a signup field.
 */
export function EarlyAccessList({
  signups,
  pending,
  inviteAction,
}: {
  signups: EarlyAccessSignup[];
  pending: number;
  /**
   * Absent means the control renders disabled. There is no separate `readOnly`
   * prop: it had no caller, and the test that covered it could not fail —
   * `readOnly || !inviteAction` is already true whenever the action is omitted,
   * so the branch rendered whatever `readOnly` did. An independent review
   * caught it. The action's absence is the honest signal.
   */
  inviteAction?: AdminFormAction;
}) {
  return (
    <section aria-labelledby="early-access-heading" className="space-y-5">
      <div className="border-b border-border pb-5">
        <h2
          id="early-access-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Waiting list
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {pending === 0
            ? "Nobody is waiting."
            : `${pending} waiting, oldest first.`}
          {signups.length < pending
            ? ` Showing the first ${signups.length}.`
            : ""}
        </p>
      </div>

      {signups.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          Nobody has joined the early-access list yet. Entries appear here as
          soon as somebody uses the dialog on the landing page.
        </p>
      ) : (
        <div className="divide-y divide-[#dedad1] border-y border-[#dedad1]">
          {signups.map((signup) => (
            <article
              key={signup.id}
              className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-all font-semibold">
                    {signup.email}
                  </h3>
                  <AdminStatus state="pending" />
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-secondary">Joined</dt>
                    <dd className="mt-0.5 font-mono text-xs">
                      {formatAdminDate(signup.createdAt)}
                    </dd>
                  </div>
                  {signup.name ? (
                    <div className="min-w-0">
                      <dt className="text-xs text-ink-secondary">Name</dt>
                      <dd className="mt-0.5 break-words">{signup.name}</dd>
                    </div>
                  ) : null}
                  {signup.heardFrom ? (
                    <div>
                      <dt className="text-xs text-ink-secondary">Heard from</dt>
                      <dd className="mt-0.5">
                        {heardFromLabels[signup.heardFrom] ?? "Somewhere else"}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {signup.hopingFor ? (
                  <div className="mt-3">
                    <p className="text-xs text-ink-secondary">Hoping for</p>
                    {/* Free text a stranger wrote. Rendered as text. */}
                    <p className="mt-0.5 max-w-2xl break-words text-sm leading-6">
                      {signup.hopingFor}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 lg:justify-self-end">
                {!inviteAction ? (
                  <Button type="button" variant="secondary" size="sm" disabled>
                    Mark invited
                  </Button>
                ) : (
                  <InviteForm signupId={signup.id} action={inviteAction} />
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

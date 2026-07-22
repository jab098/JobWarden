"use client";

import { useActionState } from "react";

import { muteEmployerAction } from "@/app/(protected)/matches/actions";
import type { TargetFeedActionState } from "@/lib/target-feed/types";

const initialState: TargetFeedActionState = { kind: "idle" };

/**
 * The employers this owner has muted, each removable. Muting happens on a match
 * card; this is the one place to see and undo it, since a muted employer's
 * matches are gone from the feed and could not be unmuted from there.
 */
export function MutedEmployers({
  employers,
}: {
  employers: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(
    muteEmployerAction,
    initialState,
  );

  if (employers.length === 0) return null;

  return (
    <section
      aria-label="Muted employers"
      className="mt-4 rounded-lg border border-border bg-surface-sunken px-4 py-3"
    >
      <h2 className="text-xs font-semibold text-foreground">Muted employers</h2>
      <p className="mt-0.5 text-xs text-ink-secondary">
        Every listing from these employers is hidden from your matches.
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {employers.map((employer) => (
          <li key={employer}>
            <form action={formAction}>
              <input type="hidden" name="employer" value={employer} />
              <input type="hidden" name="muted" value="unmute" />
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-ink-secondary outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                aria-label={`Unmute ${employer}`}
              >
                <span>{employer}</span>
                <span aria-hidden="true" className="text-ink-faint">
                  ×
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {state.kind !== "idle" && state.kind !== "success" ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

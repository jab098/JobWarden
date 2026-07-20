"use client";

import { useActionState } from "react";

import {
  decidePathwayAction,
  promotePathwayAction,
} from "@/app/(protected)/pathways/actions";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import type {
  ExploreActionState,
  ExploreSuggestionItem,
} from "@/lib/explore/types";
import { cn } from "@/lib/utils";

const initialState: ExploreActionState = { kind: "idle" };

export function ExploreItem({ item }: { item: ExploreSuggestionItem }) {
  const { suggestion } = item;
  const [decideState, decideAction, decidePending] = useActionState(
    decidePathwayAction,
    initialState,
  );
  const [promoteState, promoteAction, promotePending] = useActionState(
    promotePathwayAction,
    initialState,
  );
  const pending = decidePending || promotePending;
  const dismissed = item.decision === "dismissed";

  return (
    <li className="not-first:mt-2">
      <article
        className={cn(
          "rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere] transition-[border-color,box-shadow] duration-150 ease-(--ease-smooth-out) hover:border-input hover:shadow-[0_2px_8px_rgba(16,20,28,0.05)] sm:p-5",
          dismissed && "opacity-75",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {item.decision === "promoted" || dismissed ? (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {item.decision === "promoted" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-success"
                    />
                    Promoted earlier
                  </span>
                ) : null}
                {dismissed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-ink-faint"
                    />
                    Dismissed
                  </span>
                ) : null}
              </div>
            ) : null}
            <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-foreground">
              {suggestion.pathway.label}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-ink-secondary">
              {suggestion.pathway.summary}
            </p>
          </div>
          <div
            role="img"
            aria-label={`Overlap ${suggestion.overlapPercent}%`}
            className="shrink-0 text-right"
          >
            <span aria-hidden="true" className="flex items-baseline gap-1">
              <span className="tnum font-mono text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {suggestion.overlapPercent}%
              </span>
              <span className="font-mono text-[0.68rem] text-ink-faint">
                skill overlap
              </span>
            </span>
            <span
              aria-hidden="true"
              className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-border"
            >
              <span
                className="block h-full rounded-full bg-link/80 transition-[width] duration-(--duration-slow) ease-(--ease-smooth-out)"
                style={{ width: `${suggestion.overlapPercent}%` }}
              />
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold text-foreground">
              Matched from your confirmed evidence
            </h3>
            <ul className="mt-1.5 space-y-1">
              {suggestion.matchedSkills.map((skill) => (
                <li key={skill.label} className="text-ink-secondary">
                  <span className="font-medium text-foreground">
                    {skill.label}
                  </span>
                  {" from evidence: "}
                  {skill.evidenceLabels.map((label, index) => (
                    <span key={label}>
                      {index > 0 ? ", " : null}
                      {label}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-foreground">
              Trainable gaps
            </h3>
            {suggestion.gaps.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestion.gaps.map((gap) => (
                  <li
                    key={gap.label}
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-xs",
                      gap.significant
                        ? "border-warning/40 bg-warning-surface text-warning"
                        : "border-border bg-surface-sunken text-ink-secondary",
                    )}
                  >
                    {gap.label}
                    {gap.significant ? (
                      <span className="ml-1 font-medium">significant</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-ink-faint">
                No core-skill gaps were recorded for this pathway.
              </p>
            )}
          </section>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3.5">
          <form action={promoteAction}>
            <input
              type="hidden"
              name="pathwayConcept"
              value={suggestion.pathway.normalizedConcept}
            />
            <Button type="submit" size="sm" disabled={pending}>
              Promote to search profile
            </Button>
          </form>
          <form action={decideAction}>
            <input
              type="hidden"
              name="pathwayConcept"
              value={suggestion.pathway.normalizedConcept}
            />
            <Button
              type="submit"
              name="decision"
              value={dismissed ? "clear" : "dismissed"}
              size="sm"
              variant={dismissed ? "ghost" : "outline"}
              disabled={pending}
            >
              {dismissed ? "Restore" : "Dismiss"}
            </Button>
          </form>
          <ActionFeedback state={promoteState} />
          <ActionFeedback state={decideState} />
        </div>
      </article>
    </li>
  );
}

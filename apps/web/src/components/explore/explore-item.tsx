"use client";

import { useActionState } from "react";

import {
  decidePathwayAction,
  promotePathwayAction,
} from "@/app/(protected)/explore/actions";
import { Button } from "@/components/ui/button";
import type {
  ExploreActionState,
  ExploreSuggestionItem,
} from "@/lib/explore/types";

const initialState: ExploreActionState = { kind: "idle" };

function ActionFeedback({ state }: { state: ExploreActionState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "success") {
    return (
      <span role="status" className="text-xs text-[#596173]">
        {state.message}
      </span>
    );
  }
  return (
    <span role="alert" className="text-xs text-[#8a3328]">
      {state.message}
    </span>
  );
}

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
    <li className="border-b border-[#e7e3da]">
      <article className="px-5 py-6 [overflow-wrap:anywhere] sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {item.decision === "promoted" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#235b3b]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[#3f8f5f]"
                  />
                  Promoted
                </span>
              ) : null}
              {dismissed ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5b616d]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-[#8a8f99]"
                  />
                  Dismissed
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#172033]">
              {suggestion.pathway.label}
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#596173]">
              {suggestion.pathway.summary}
            </p>
          </div>
          <div
            role="img"
            aria-label={`Overlap ${suggestion.overlapPercent}%`}
            className="shrink-0 text-right"
          >
            <span
              aria-hidden="true"
              className="font-mono text-2xl font-semibold tabular-nums text-[#172033]"
            >
              {suggestion.overlapPercent}%
            </span>
            <span
              aria-hidden="true"
              className="block font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[#7a828f]"
            >
              Skill overlap
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
              Matched from your confirmed evidence
            </h3>
            <ul className="mt-1.5 space-y-1">
              {suggestion.matchedSkills.map((skill) => (
                <li key={skill.label} className="text-[#40495a]">
                  <span className="font-medium">{skill.label}</span>
                  {" — evidence: "}
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
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
              Trainable gaps
            </h3>
            {suggestion.gaps.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestion.gaps.map((gap) => (
                  <li
                    key={gap.label}
                    className="rounded border border-[#e2ddd3] px-2 py-0.5 text-[#40495a]"
                  >
                    {gap.label}
                    {gap.significant ? (
                      <span className="ml-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-[#6f4d07]">
                        significant
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[#596173]">
                No core-skill gaps were recorded for this pathway.
              </p>
            )}
          </section>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { decideJobAction } from "@/app/(protected)/matches/actions";
import { Button } from "@/components/ui/button";
import {
  formatCompensation,
  formatIr35,
  formatJobLabel,
  formatPostedAge,
} from "@/components/jobs/job-format";
import type { TargetFeedActionState } from "@/lib/target-feed/types";
import type {
  JobDecision,
  TargetFeedItem as Item,
} from "@/lib/target-feed/types";
import type { TargetFeedExplanation } from "@jobwarden/domain";

const initialState: TargetFeedActionState = { kind: "idle" };

const decisionMeta: Record<
  JobDecision,
  { label: string; dot: string; text: string }
> = {
  saved: { label: "Saved", dot: "bg-[#3f8f5f]", text: "text-[#235b3b]" },
  considering: {
    label: "Considering",
    dot: "bg-[#d8a646]",
    text: "text-[#6f4d07]",
  },
  dismissed: {
    label: "Dismissed",
    dot: "bg-[#8a8f99]",
    text: "text-[#5b616d]",
  },
};

function compensationCopy(
  treatment: TargetFeedExplanation["compensationTreatment"],
): string {
  if (treatment.kind === "unknown") {
    return "Salary not stated, allowed by your profile.";
  }
  const label = treatment.kind === "advertised" ? "Advertised" : "Estimated";
  return treatment.withinPreference
    ? `${label} salary, within your compensation preference.`
    : `${label} salary, outside your compensation preference.`;
}

export function TargetFeedItem({
  item,
  includeDismissed,
}: {
  item: Item;
  includeDismissed: boolean;
}) {
  const { job, explanation } = item;
  const [submitted, setSubmitted] = useState<JobDecision | null | undefined>(
    undefined,
  );
  const [state, formAction, pending] = useActionState(
    decideJobAction,
    initialState,
  );

  // Optimistic while the action is in flight or after it succeeded; a failed
  // action falls back to the server-known decision so the row (and its
  // alert) stays visible.
  const decision =
    submitted !== undefined && (pending || state.kind === "success")
      ? submitted
      : item.decision;

  const collapsed = decision === "dismissed" && !includeDismissed;
  const compensation = formatCompensation(job);
  const ir35 = formatIr35(job);
  const current = decision ? decisionMeta[decision] : null;

  return (
    <li
      data-decision={decision ?? "none"}
      aria-hidden={collapsed || undefined}
      inert={collapsed}
      className={`overflow-hidden border-b border-[#e7e3da] transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none ${
        collapsed
          ? "pointer-events-none max-h-0 opacity-0"
          : "max-h-[80rem] opacity-100"
      }`}
    >
      <article className="px-5 py-6 [overflow-wrap:anywhere] sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="rounded border border-[#d8dde6] px-2 py-0.5 text-xs font-medium text-[#40495a]">
                {explanation.profileName}
              </span>
              {current ? (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${current.text}`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${current.dot}`}
                  />
                  {current.label}
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#172033]">
              {job.title}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#4e5768]">
              {job.employer}
            </p>
          </div>
          <div
            role="img"
            aria-label={`Fit ${explanation.score} of 100`}
            className="shrink-0 text-right"
          >
            <span
              aria-hidden="true"
              className="font-mono text-2xl font-semibold tabular-nums text-[#172033]"
            >
              {explanation.score}
            </span>
            <span
              aria-hidden="true"
              className="block font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[#7a828f]"
            >
              Fit / 100
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#596173]">
          <span>{job.location}</span>
          <span aria-hidden="true">·</span>
          <span>
            {formatJobLabel(job.workplaceType, "Workplace not stated")}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {formatJobLabel(job.employmentType, "Employment not stated")}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {formatJobLabel(job.workingTime, "Working time not stated")}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-[#263248]">
            {compensation ?? "Salary not stated"}
          </span>
          {ir35 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{ir35}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>{formatPostedAge(job.postedAt)}</span>
        </div>

        <details className="mt-4 rounded-md border border-[#e7e3da] bg-white">
          <summary className="cursor-pointer select-none rounded-md px-4 py-2.5 text-sm font-medium text-[#2458a6] transition-colors duration-150 ease-out hover:bg-[#fbfaf7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] motion-reduce:transition-none">
            Why this match
          </summary>
          <div className="space-y-4 border-t border-[#ece9e2] px-4 py-4 text-sm">
            <Disclosure
              heading="Matching evidence"
              items={explanation.matchedEvidence}
            >
              No confirmed evidence text matched this listing.
            </Disclosure>
            <Disclosure
              heading="Important gaps"
              items={explanation.importantGaps}
            >
              No important gaps were recorded for this listing.
            </Disclosure>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
                Synonym credit
              </h3>
              {explanation.synonymCredits.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {explanation.synonymCredits.map((credit) => (
                    <li
                      key={`${credit.term}-${credit.evidenceLabel}`}
                      className="text-[#40495a]"
                    >
                      <span className="font-medium">{credit.term}</span>{" "}
                      credited from confirmed evidence: {credit.evidenceLabel}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-[#596173]">
                  No synonym credit was applied.
                </p>
              )}
            </section>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
                Compensation treatment
              </h3>
              <p className="mt-1.5 text-[#40495a]">
                {compensationCopy(explanation.compensationTreatment)}
              </p>
            </section>
          </div>
        </details>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form
            action={formAction}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="jobId" value={job.id} />
            <Button
              type="submit"
              name="decision"
              value="saved"
              size="sm"
              variant={decision === "saved" ? "default" : "outline"}
              disabled={pending}
              onClick={() => setSubmitted("saved")}
            >
              Save
            </Button>
            <Button
              type="submit"
              name="decision"
              value="considering"
              size="sm"
              variant={decision === "considering" ? "default" : "outline"}
              disabled={pending}
              onClick={() => setSubmitted("considering")}
            >
              Considering
            </Button>
            <Button
              type="submit"
              name="decision"
              value="dismissed"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setSubmitted("dismissed")}
            >
              Dismiss
            </Button>
            {decision ? (
              <Button
                type="submit"
                name="decision"
                value="clear"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setSubmitted(null)}
              >
                Clear
              </Button>
            ) : null}
          </form>
          <Link
            href={`/jobs/${job.id}`}
            className="rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
          >
            View details
          </Link>
          {state.kind !== "idle" && state.kind !== "success" ? (
            <span role="alert" className="text-xs text-[#8a3328]">
              {state.message}
            </span>
          ) : null}
          {state.kind === "success" ? (
            <span role="status" className="text-xs text-[#596173]">
              {state.message}
            </span>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function Disclosure({
  heading,
  items,
  children,
}: {
  heading: string;
  items: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#697181]">
        {heading}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="rounded border border-[#e2ddd3] px-2 py-0.5 text-[#40495a]"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[#596173]">{children}</p>
      )}
    </section>
  );
}

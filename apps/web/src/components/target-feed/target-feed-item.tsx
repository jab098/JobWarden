"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  decideJobAction,
  muteEmployerAction,
} from "@/app/(protected)/matches/actions";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import {
  formatClosingSoon,
  formatPostedAge,
} from "@/components/jobs/job-format";
import { JobFacts } from "@/components/jobs/job-facts";
import type { TargetFeedActionState } from "@/lib/target-feed/types";
import type {
  JobDecision,
  TargetFeedItem as Item,
} from "@/lib/target-feed/types";
import type { TargetFeedExplanation } from "@jobwarden/domain";
import { cn } from "@/lib/utils";

const initialState: TargetFeedActionState = { kind: "idle" };

const decisionMeta: Record<JobDecision, { label: string; dot: string }> = {
  saved: { label: "Saved", dot: "bg-success" },
  considering: { label: "Considering", dot: "bg-warning" },
  dismissed: { label: "Dismissed", dot: "bg-ink-faint" },
};

/** Fit tiers colour the score everywhere it appears: 80+ strong, 55+ moderate. */
function fitTone(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 55) return "text-warning";
  return "text-muted-foreground";
}

function fitBarTone(score: number): string {
  if (score >= 80) return "bg-success";
  if (score >= 55) return "bg-warning";
  return "bg-ink-faint";
}

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
  const closing = formatClosingSoon(job.closesAt);
  const [submitted, setSubmitted] = useState<JobDecision | null | undefined>(
    undefined,
  );
  const [state, formAction, pending] = useActionState(
    decideJobAction,
    initialState,
  );
  const [muteState, muteAction, mutePending] = useActionState(
    muteEmployerAction,
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
  const current = decision ? decisionMeta[decision] : null;
  const errorMessage =
    state.kind !== "idle" && state.kind !== "success"
      ? state.message
      : muteState.kind !== "idle" && muteState.kind !== "success"
        ? muteState.message
        : null;

  return (
    <li
      data-decision={decision ?? "none"}
      aria-hidden={collapsed || undefined}
      inert={collapsed}
      className={cn(
        "overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out motion-reduce:transition-none",
        collapsed
          ? "pointer-events-none max-h-0 opacity-0"
          : "max-h-[80rem] opacity-100 not-first:mt-2",
      )}
    >
      <article className="card-surface p-4 [overflow-wrap:anywhere] card-interactive sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[0.7rem] font-medium text-ink-secondary">
                {explanation.profileName}
              </span>
              {current ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 rounded-full", current.dot)}
                  />
                  {current.label}
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-[0.95rem] font-semibold tracking-[-0.01em] text-foreground">
              <Link
                href={`/jobs/${job.id}`}
                className="rounded-sm outline-none transition-colors duration-150 hover:text-link focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {job.title}
              </Link>
            </h2>
            <p className="mt-0.5 text-sm text-ink-secondary">{job.employer}</p>
          </div>
          <div
            role="img"
            aria-label={`Fit ${explanation.score} of 100`}
            className="shrink-0 text-right"
          >
            <span aria-hidden="true" className="flex items-baseline gap-1">
              <span
                className={cn(
                  "tnum font-mono text-2xl font-semibold tracking-[-0.02em]",
                  fitTone(explanation.score),
                )}
              >
                {explanation.score}
              </span>
              <span className="font-mono text-[0.68rem] text-ink-faint">
                / 100 fit
              </span>
            </span>
            <span
              aria-hidden="true"
              className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-border"
            >
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-(--duration-slow) ease-(--ease-smooth-out)",
                  fitBarTone(explanation.score),
                )}
                style={{ width: `${explanation.score}%` }}
              />
            </span>
          </div>
        </div>

        <JobFacts job={job} className="mt-3.5" />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-ink-faint">
            {formatPostedAge(job.postedAt)}
          </span>
          {closing ? (
            <span className="text-xs font-medium text-warning">{closing}</span>
          ) : null}
        </div>

        {explanation.matchedEvidence.length > 0 ||
        explanation.importantGaps.length > 0 ? (
          <div className="mt-4 space-y-2.5">
            {explanation.matchedEvidence.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold text-foreground">
                  Why this match
                </h3>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {explanation.matchedEvidence.map((item) => (
                    <li
                      key={item}
                      className="rounded-sm border border-success/35 bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {explanation.importantGaps.length > 0 ? (
              <div>
                <h3 className="text-xs font-medium text-ink-secondary">Gaps</h3>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {explanation.importantGaps.map((item) => (
                    <li
                      key={item}
                      className="rounded-sm border border-border bg-surface-sunken px-2 py-0.5 text-xs text-ink-faint"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <Disclosure
          label="Match detail"
          className="mt-3"
          panelClassName="px-3.5 py-3.5 text-sm"
        >
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-semibold text-foreground">
                Synonym credit
              </h3>
              {explanation.synonymCredits.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {explanation.synonymCredits.map((credit) => (
                    <li
                      key={`${credit.term}-${credit.evidenceLabel}`}
                      className="text-ink-secondary"
                    >
                      <span className="font-medium text-foreground">
                        {credit.term}
                      </span>{" "}
                      credited from confirmed evidence: {credit.evidenceLabel}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-ink-faint">
                  No synonym credit was applied.
                </p>
              )}
            </section>
            <section>
              <h3 className="text-xs font-semibold text-foreground">
                Compensation treatment
              </h3>
              <p className="mt-1.5 text-ink-secondary">
                {compensationCopy(explanation.compensationTreatment)}
              </p>
            </section>
          </div>
        </Disclosure>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3.5">
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
          <form action={muteAction}>
            <input type="hidden" name="employer" value={job.employer} />
            <input type="hidden" name="muted" value="mute" />
            <button
              type="submit"
              disabled={mutePending}
              aria-label={`Mute ${job.employer} across your matches`}
              className="rounded-sm text-xs font-medium text-ink-faint outline-none transition-colors duration-150 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              Mute employer
            </button>
          </form>
          <Link
            href={`/jobs/${job.id}`}
            className="ml-auto rounded-sm text-xs font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            View details
          </Link>
          {errorMessage ? (
            <span role="alert" className="text-xs text-danger">
              {errorMessage}
            </span>
          ) : null}
          {state.kind === "success" ? (
            <span role="status" className="text-xs text-ink-faint">
              {state.message}
            </span>
          ) : null}
        </div>
      </article>
    </li>
  );
}

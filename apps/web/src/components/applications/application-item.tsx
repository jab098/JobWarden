"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  applicationTransitions,
  type ApplicationStage,
  type NextActionState,
} from "@jobwarden/domain";

import {
  deleteApplicationAction,
  transitionApplicationAction,
  updateApplicationPlanAction,
} from "@/app/(protected)/applications/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { formatCompensation } from "@/components/jobs/job-format";
import type {
  ApplicationItem as Item,
  ApplicationsActionState,
} from "@/lib/applications/types";

const initialState: ApplicationsActionState = { kind: "idle" };

export const stageLabels: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

const stageDots: Record<ApplicationStage, string> = {
  applied: "bg-[#8a8f99]",
  screening: "bg-[#d8a646]",
  interviewing: "bg-[#2458a6]",
  offer: "bg-[#3f8f5f]",
  accepted: "bg-[#3f8f5f]",
  rejected: "bg-[#8a3328]",
  withdrawn: "bg-[#8a8f99]",
  archived: "bg-[#8a8f99]",
};

const nextActionCopy: Record<
  Exclude<NextActionState, "none">,
  { label: string; dot: string; text: string }
> = {
  overdue: { label: "Overdue", dot: "bg-[#8a3328]", text: "text-[#8a3328]" },
  due_today: {
    label: "Due today",
    dot: "bg-[#d8a646]",
    text: "text-[#6f4d07]",
  },
  upcoming: { label: "Upcoming", dot: "bg-[#3f8f5f]", text: "text-[#235b3b]" },
};

function formatDueDate(dueOn: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
    new Date(`${dueOn}T00:00:00Z`),
  );
}

export function ApplicationItem({
  item,
  compact = false,
}: {
  item: Item;
  compact?: boolean;
}) {
  const [transitionState, transitionAction, transitionPending] = useActionState(
    transitionApplicationAction,
    initialState,
  );
  const [planState, planAction, planPending] = useActionState(
    updateApplicationPlanAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteApplicationAction,
    initialState,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pending = transitionPending || planPending || deletePending;

  const targets = applicationTransitions[item.stage];
  const nextActionState =
    item.nextActionState === "none"
      ? null
      : nextActionCopy[item.nextActionState];
  const compensation = formatCompensation(item.job);

  return (
    <li className="border-b border-[#e7e3da]">
      <article className="px-5 py-5 [overflow-wrap:anywhere] sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#40495a]">
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${stageDots[item.stage]}`}
                />
                {stageLabels[item.stage]}
              </span>
              {nextActionState ? (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${nextActionState.text}`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${nextActionState.dot}`}
                  />
                  {nextActionState.label}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-[#172033]">
              {item.job.title}
            </h3>
            <p className="mt-0.5 text-sm font-medium text-[#4e5768]">
              {item.job.employer}
            </p>
            {!compact ? (
              <p className="mt-1 text-sm text-[#596173]">
                {item.job.location}
                {compensation ? ` · ${compensation}` : ""}
              </p>
            ) : null}
          </div>
          <Link
            href={`/jobs/${item.job.id}`}
            className="rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
          >
            View job
          </Link>
        </div>

        {item.nextAction ? (
          <p className="mt-2 text-sm text-[#40495a]">
            Next: <span className="font-medium">{item.nextAction}</span>
            {item.nextActionDueOn
              ? ` (due ${formatDueDate(item.nextActionDueOn)})`
              : ""}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {targets.length > 0 ? (
            <form
              action={transitionAction}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="applicationId" value={item.id} />
              <label
                htmlFor={`stage-${item.id}`}
                className="text-xs font-medium text-[#596173]"
              >
                Move to
              </label>
              <select
                id={`stage-${item.id}`}
                name="stage"
                disabled={pending}
                className="h-8 rounded-md border border-[#d8dde6] bg-white px-2 text-sm text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                defaultValue={targets[0]}
              >
                {targets.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabels[stage]}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={pending}
              >
                Move
              </Button>
            </form>
          ) : (
            <span className="text-xs text-[#596173]">
              This application is closed.
            </span>
          )}
          <ActionFeedback state={transitionState} />
        </div>

        {!compact ? (
          <details className="mt-3 rounded-md border border-[#e7e3da] bg-white">
            <summary className="cursor-pointer select-none rounded-md px-4 py-2 text-sm font-medium text-[#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]">
              Next action and notes
            </summary>
            <form
              action={planAction}
              className="space-y-3 border-t border-[#ece9e2] px-4 py-4 text-sm"
            >
              <input type="hidden" name="applicationId" value={item.id} />
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-56 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-[#596173]">
                    Next action
                  </span>
                  <input
                    type="text"
                    name="nextAction"
                    maxLength={200}
                    defaultValue={item.nextAction ?? ""}
                    className="h-9 rounded-md border border-[#d8dde6] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#596173]">
                    Due date
                  </span>
                  <input
                    type="date"
                    name="nextActionDueOn"
                    defaultValue={item.nextActionDueOn ?? ""}
                    className="h-9 rounded-md border border-[#d8dde6] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#596173]">
                  Notes
                </span>
                <textarea
                  name="notes"
                  maxLength={2000}
                  rows={3}
                  defaultValue={item.notes ?? ""}
                  className="rounded-md border border-[#d8dde6] px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" disabled={pending}>
                  Save plan
                </Button>
                <ActionFeedback state={planState} />
              </div>
            </form>
          </details>
        ) : null}

        {!compact ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {confirmingDelete ? (
              <form action={deleteAction}>
                <input type="hidden" name="applicationId" value={item.id} />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                >
                  Confirm delete
                </Button>
              </form>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmingDelete((current) => !current)}
            >
              {confirmingDelete ? "Keep application" : "Delete"}
            </Button>
            <ActionFeedback state={deleteState} />
          </div>
        ) : null}
      </article>
    </li>
  );
}

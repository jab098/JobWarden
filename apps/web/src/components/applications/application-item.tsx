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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ApplicationItem as Item,
  ApplicationsActionState,
} from "@/lib/applications/types";
import { cn } from "@/lib/utils";

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
  applied: "bg-ink-faint",
  screening: "bg-warning",
  interviewing: "bg-link",
  offer: "bg-success",
  accepted: "bg-success",
  rejected: "bg-danger",
  withdrawn: "bg-ink-faint",
  archived: "bg-ink-faint",
};

const nextActionCopy: Record<
  Exclude<NextActionState, "none">,
  { label: string; dot: string; text: string }
> = {
  overdue: { label: "Overdue", dot: "bg-danger", text: "text-danger" },
  due_today: {
    label: "Due today",
    dot: "bg-warning",
    text: "text-warning",
  },
  upcoming: { label: "Upcoming", dot: "bg-success", text: "text-success" },
};

// UTC in and UTC out, so an ISO date never shifts by a day for any viewer
// and server/client renders always agree.
const dueDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDueDate(dueOn: string): string {
  return dueDateFormat.format(new Date(`${dueOn}T00:00:00Z`));
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
  const compensation = item.job ? formatCompensation(item.job) : null;

  return (
    <li
      className={
        compact
          ? "not-first:border-t not-first:border-border"
          : "not-first:mt-2.5"
      }
    >
      <article
        className={cn(
          "[overflow-wrap:anywhere]",
          compact
            ? "bg-card p-3.5"
            : "rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow] duration-150 ease-(--ease-smooth-out) hover:border-input hover:shadow-[0_2px_8px_rgba(16,20,28,0.05)] sm:p-5",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 rounded-full", stageDots[item.stage])}
                />
                {stageLabels[item.stage]}
              </span>
              {nextActionState ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium",
                    nextActionState.text,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 rounded-full", nextActionState.dot)}
                  />
                  {nextActionState.label}
                </span>
              ) : null}
            </div>
            <h3
              className={cn(
                "mt-1.5 font-semibold tracking-[-0.01em] text-foreground",
                compact ? "text-sm" : "text-[0.95rem]",
              )}
            >
              {item.job ? item.job.title : "Listing no longer available"}
            </h3>
            {item.job ? (
              <p className="mt-0.5 text-sm text-ink-secondary">
                {item.job.employer}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-ink-faint">
                The advert has closed or been withdrawn; your tracked
                application and its history are unaffected.
              </p>
            )}
            {!compact && item.job ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-secondary">
                <span className="font-medium text-foreground">
                  {item.job.location}
                </span>
                {compensation ? (
                  <>
                    <span aria-hidden="true" className="text-ink-faint/70">
                      ·
                    </span>
                    <span className="tnum font-mono">{compensation}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          {item.job ? (
            <Link
              href={`/jobs/${item.job.id}`}
              className="rounded-sm text-xs font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              View job
            </Link>
          ) : null}
        </div>

        {item.nextAction ? (
          <p className="mt-2.5 rounded-md bg-surface-sunken px-2.5 py-1.5 text-sm text-ink-secondary">
            Next:{" "}
            <span className="font-medium text-foreground">
              {item.nextAction}
            </span>
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
              <span
                id={`stage-label-${item.id}`}
                className="text-xs font-medium text-ink-secondary"
              >
                Move to
              </span>
              <Select
                name="stage"
                defaultValue={targets[0]}
                items={targets.map((stage) => ({
                  value: stage,
                  label: stageLabels[stage],
                }))}
              >
                <SelectTrigger
                  aria-labelledby={`stage-label-${item.id}`}
                  size="sm"
                  disabled={pending}
                  className="min-w-32 bg-card"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  {targets.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stageLabels[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <span className="text-xs text-ink-faint">
              This application is closed.
            </span>
          )}
          <ActionFeedback state={transitionState} />
        </div>

        {!compact ? (
          <details className="group mt-3 rounded-md border border-border">
            <summary className="cursor-pointer list-none rounded-md px-3.5 py-2 text-sm font-medium text-link transition-colors duration-150 select-none group-open:rounded-b-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1.5">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 8 8"
                  className="size-2 fill-none stroke-current transition-transform duration-(--duration-quick) ease-(--ease-smooth-out) group-open:rotate-90"
                >
                  <path d="M2.5 1 L5.5 4 L2.5 7" strokeWidth="1.2" />
                </svg>
                Next action and notes
              </span>
            </summary>
            <form
              action={planAction}
              className="space-y-3 border-t border-border px-3.5 py-3.5 text-sm"
            >
              <input type="hidden" name="applicationId" value={item.id} />
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-56 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-ink-secondary">
                    Next action
                  </span>
                  <Input
                    type="text"
                    name="nextAction"
                    maxLength={200}
                    defaultValue={item.nextAction ?? ""}
                    className="bg-card"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink-secondary">
                    Due date
                  </span>
                  <Input
                    type="date"
                    name="nextActionDueOn"
                    defaultValue={item.nextActionDueOn ?? ""}
                    className="bg-card"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-secondary">
                  Notes
                </span>
                <Textarea
                  name="notes"
                  maxLength={2000}
                  rows={3}
                  defaultValue={item.notes ?? ""}
                  className="bg-card"
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
                  variant="destructive"
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
              className="text-ink-faint hover:text-danger"
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

"use client";

import { useActionState } from "react";

import { decideEvidenceAction } from "@/app/(protected)/profile/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CareerEvidenceItem } from "@jobwarden/domain";
import type { ProfileActionState } from "@/lib/profile/types";

const initialState: ProfileActionState = { kind: "idle" };

function evidenceState(item: CareerEvidenceItem): string {
  if (item.confirmationState === "confirmed") return "Confirmed";
  if (item.confirmationState === "rejected") return "Excluded";
  return "Needs review";
}

function EvidenceDecision({
  item,
  readOnly,
}: {
  item: CareerEvidenceItem;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    decideEvidenceAction,
    initialState,
  );
  return (
    <form action={action} className="flex flex-wrap gap-2 sm:justify-end">
      <input type="hidden" name="evidenceId" value={item.id} />
      <Button
        type="submit"
        name="decision"
        value="confirmed"
        variant="outline"
        size="sm"
        aria-label={`Confirm ${item.label}`}
        disabled={readOnly || pending}
      >
        Confirm
      </Button>
      <Button
        type="submit"
        name="decision"
        value="rejected"
        variant="ghost"
        size="sm"
        aria-label={`Exclude ${item.label}`}
        disabled={readOnly || pending}
      >
        Exclude
      </Button>
      {state.kind !== "idle" ? (
        <span
          role={state.kind === "success" ? "status" : "alert"}
          className="basis-full text-right text-xs text-ink-secondary"
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function ProfileEvidenceList({
  evidence,
  readOnly,
}: {
  evidence: readonly CareerEvidenceItem[];
  readOnly: boolean;
}) {
  return (
    <section
      aria-labelledby="profile-evidence-heading"
      className="mt-3 card-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2
            id="profile-evidence-heading"
            className="text-base font-semibold tracking-[-0.01em]"
          >
            Evidence to review
          </h2>
        </div>
        <span className="text-sm text-ink-secondary">
          {evidence.length} {evidence.length === 1 ? "item" : "items"}
        </span>
      </div>
      {evidence.length === 0 ? (
        <p className="mt-5 max-w-2xl text-sm leading-6 text-ink-secondary">
          Add a skill or career direction to begin. Extracted CV evidence will
          appear here only after the private upload path is activated and you
          review it.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {evidence.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {item.label}
                  </span>
                  <Badge variant="outline" className="rounded-sm font-normal">
                    {item.category.replaceAll("_", " ")}
                  </Badge>
                </div>
                {item.evidenceExcerpt ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                    {item.evidenceExcerpt}
                  </p>
                ) : null}
                <p className="mt-2 font-mono text-[0.7rem] text-ink-faint">
                  {item.origin === "cv" ? "CV evidence" : "Added by you"} ·{" "}
                  {item.proficiencySignal}
                </p>
              </div>
              {item.confirmationState === "proposed" ? (
                <EvidenceDecision item={item} readOnly={readOnly} />
              ) : (
                <Badge
                  variant={
                    item.confirmationState === "rejected"
                      ? "destructive"
                      : "secondary"
                  }
                  className="rounded-sm"
                >
                  {evidenceState(item)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

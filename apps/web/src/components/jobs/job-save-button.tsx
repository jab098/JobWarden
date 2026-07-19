"use client";

import { useActionState, useState } from "react";

import { decideJobAction } from "@/app/(protected)/matches/actions";
import { Button } from "@/components/ui/button";
import type {
  JobDecision,
  TargetFeedActionState,
} from "@/lib/target-feed/types";

const initialState: TargetFeedActionState = { kind: "idle" };

/**
 * Search results offer only save and unsave. The richer considering/dismiss
 * vocabulary belongs to the matches feed, where a dismissal means "stop
 * scoring this against me" rather than "I am not reading this listing today".
 */
export function JobSaveButton({
  jobId,
  decision,
}: {
  jobId: string;
  decision: JobDecision | null;
}) {
  const [submitted, setSubmitted] = useState<JobDecision | null | undefined>(
    undefined,
  );
  const [state, formAction, pending] = useActionState(
    decideJobAction,
    initialState,
  );

  // Optimistic while in flight or once it succeeded; a failure falls back to
  // the server-known decision so the control never lies about what was saved.
  const current =
    submitted !== undefined && (pending || state.kind === "success")
      ? submitted
      : decision;
  const saved = current === "saved";

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <Button
        type="submit"
        name="decision"
        value={saved ? "clear" : "saved"}
        size="sm"
        variant={saved ? "default" : "outline"}
        disabled={pending}
        onClick={() => setSubmitted(saved ? null : "saved")}
      >
        {saved ? "Saved" : "Save"}
      </Button>
      {current !== null && !saved ? (
        <span className="text-xs text-[#596173]">
          {current === "considering" ? "Considering" : "Dismissed in matches"}
        </span>
      ) : null}
      {state.kind !== "idle" && state.kind !== "success" ? (
        <span role="alert" className="text-xs text-[#8a3328]">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

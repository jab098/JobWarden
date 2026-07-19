"use client";

import { useActionState } from "react";

import { trackApplicationAction } from "@/app/(protected)/applications/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/action-feedback";
import type { ApplicationsActionState } from "@/lib/applications/types";

const initialState: ApplicationsActionState = { kind: "idle" };

/**
 * Records that the user applied on the employer's own site. JobWarden never
 * submits an application itself.
 */
export function TrackApplicationButton({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(
    trackApplicationAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Track my application
      </Button>
      <span className="text-xs text-[#596173]">
        Applied on the employer&apos;s site? Track it here.
      </span>
      <ActionFeedback state={state} />
    </form>
  );
}

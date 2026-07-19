"use client";

import Link from "next/link";
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
export function TrackApplicationButton({
  jobId,
  tracked,
}: {
  jobId: string;
  tracked: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    trackApplicationAction,
    initialState,
  );

  if (tracked && state.kind === "idle") {
    return (
      <p className="text-sm text-[#40495a]">
        You are tracking an application for this job.{" "}
        <Link
          href="/applications"
          className="rounded-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          Manage it under Applications
        </Link>
        .
      </p>
    );
  }

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

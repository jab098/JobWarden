"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { AccessRequestView, AdminFormAction } from "@/lib/admin/types";

const initialState = { kind: "idle" as const };

const decisions = {
  pending: [
    { nextStatus: "approved", label: "Approve", confirm: "Confirm approval" },
    { nextStatus: "rejected", label: "Reject", confirm: "Confirm rejection" },
  ],
  approved: [
    {
      nextStatus: "suspended",
      label: "Suspend",
      confirm: "Confirm suspension",
    },
  ],
  rejected: [
    { nextStatus: "pending", label: "Reopen", confirm: "Confirm reopening" },
  ],
  suspended: [
    {
      nextStatus: "approved",
      label: "Restore",
      confirm: "Confirm restoration",
    },
  ],
} as const;

function InteractiveDecision({
  request,
  action,
  decision,
}: {
  request: AccessRequestView;
  action: AdminFormAction;
  decision: (typeof decisions)[keyof typeof decisions][number];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const verb = decision.label.toLowerCase();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant={decision.nextStatus === "approved" ? "default" : "outline"}
            size="sm"
          />
        }
      >
        {decision.label}
      </AlertDialogTrigger>
      <AlertDialogContent
        aria-label={`${decision.label} access for ${request.displayName}?`}
        className="max-w-md"
      >
        <form action={formAction}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision.label} access for {request.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This audited decision changes the member&apos;s private-beta
              access. Record a concise operational reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="userId" value={request.userId} />
          <input type="hidden" name="nextStatus" value={decision.nextStatus} />
          <div className="mt-5 space-y-2">
            <Label htmlFor={`${request.userId}-${decision.nextStatus}`}>
              Decision reason
            </Label>
            <Textarea
              id={`${request.userId}-${decision.nextStatus}`}
              name="reason"
              minLength={3}
              maxLength={500}
              required
              placeholder={`Why should this access be ${verb}d?`}
              aria-invalid={state.kind === "invalid" || undefined}
            />
            {state.kind !== "idle" && state.kind !== "success" ? (
              <p role="alert" className="text-sm text-[#8a3030]">
                {state.message}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter className="mt-5">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={pending}>
              {pending ? "Recording…" : decision.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccessDecisionForm({
  request,
  action,
}: {
  request: AccessRequestView;
  action?: AdminFormAction;
}) {
  if (!action) {
    return (
      <div
        className="flex flex-wrap gap-2"
        aria-label="Read-only access decisions"
      >
        {decisions[request.status].map((decision) => (
          <Button
            key={decision.nextStatus}
            size="sm"
            variant="outline"
            disabled
          >
            {decision.label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {decisions[request.status].map((decision) => (
        <InteractiveDecision
          key={decision.nextStatus}
          request={request}
          action={action}
          decision={decision}
        />
      ))}
    </div>
  );
}

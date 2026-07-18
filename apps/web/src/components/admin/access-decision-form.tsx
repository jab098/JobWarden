"use client";

import { useActionState, useCallback, useState } from "react";

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

type Decision = (typeof decisions)[keyof typeof decisions][number];

function InteractiveDecision({
  request,
  decision,
  formAction,
  open,
  onOpenChange,
  pending,
}: {
  request: AccessRequestView;
  decision: Decision;
  formAction: (formData: FormData) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
              placeholder={`Why is ${decision.nextStatus} the correct access state?`}
            />
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

function InteractiveAccessDecisions({
  request,
  action,
}: {
  request: AccessRequestView;
  action: AdminFormAction;
}) {
  const [openDecision, setOpenDecision] = useState<string | null>(null);
  const closingAction = useCallback<AdminFormAction>(
    async (previousState, formData) => {
      const result = await action(previousState, formData);
      setOpenDecision(null);
      return result;
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(
    closingAction,
    initialState,
  );

  return (
    <div className="space-y-2 lg:justify-self-end">
      <div className="flex flex-wrap gap-2">
        {decisions[request.status].map((decision) => (
          <InteractiveDecision
            key={decision.nextStatus}
            request={request}
            decision={decision}
            formAction={formAction}
            open={openDecision === decision.nextStatus}
            onOpenChange={(open) =>
              setOpenDecision(open ? decision.nextStatus : null)
            }
            pending={pending}
          />
        ))}
      </div>
      {state.kind !== "idle" ? (
        <p
          role={state.kind === "success" ? "status" : "alert"}
          className={
            state.kind === "success"
              ? "text-sm text-[#245d43]"
              : "text-sm text-[#8a3030]"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
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

  return <InteractiveAccessDecisions request={request} action={action} />;
}

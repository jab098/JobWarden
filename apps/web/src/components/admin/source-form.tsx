"use client";

import { useActionState, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";
import type { AdminFormAction, JobSourceView } from "@/lib/admin/types";

const initialState = { kind: "idle" as const };

function SourceFields({ source }: { source?: JobSourceView }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="sourceId" value={source?.sourceId ?? ""} />
      <input type="hidden" name="provider" value="greenhouse" />
      <div className="space-y-2">
        <Label htmlFor={`employer-${source?.sourceId ?? "new"}`}>
          Employer
        </Label>
        <Input
          id={`employer-${source?.sourceId ?? "new"}`}
          name="employerName"
          defaultValue={source?.employerName}
          required
          maxLength={300}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`board-${source?.sourceId ?? "new"}`}>
          Greenhouse board token
        </Label>
        <Input
          id={`board-${source?.sourceId ?? "new"}`}
          name="boardToken"
          defaultValue={source?.boardToken}
          required
          maxLength={200}
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`enabled-${source?.sourceId ?? "new"}`}>
          Source state
        </Label>
        <select
          id={`enabled-${source?.sourceId ?? "new"}`}
          name="enabled"
          defaultValue={source?.enabled === false ? "false" : "true"}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`interval-${source?.sourceId ?? "new"}`}>
          Minimum sync interval (minutes)
        </Label>
        <Input
          id={`interval-${source?.sourceId ?? "new"}`}
          name="minimumSyncMinutes"
          type="number"
          min={15}
          max={10_080}
          step={1}
          defaultValue={source?.minimumSyncMinutes ?? 60}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`terms-${source?.sourceId ?? "new"}`}>
          Terms reviewed
        </Label>
        <Input
          id={`terms-${source?.sourceId ?? "new"}`}
          name="termsReviewedAt"
          type="date"
          defaultValue={source?.termsReviewedAt}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`robots-${source?.sourceId ?? "new"}`}>
          Robots reviewed
        </Label>
        <Input
          id={`robots-${source?.sourceId ?? "new"}`}
          name="robotsReviewedAt"
          type="date"
          defaultValue={source?.robotsReviewedAt}
          required
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`hosts-${source?.sourceId ?? "new"}`}>
          Allowed application hosts
        </Label>
        <Textarea
          id={`hosts-${source?.sourceId ?? "new"}`}
          name="allowedHosts"
          defaultValue={source?.allowedHosts.join("\n")}
          placeholder={"boards.greenhouse.io\nemployer.example.test"}
          required
          className="min-h-24 font-mono text-xs"
        />
        <p className="text-xs text-ink-secondary">
          One bare lowercase hostname per line. No schemes or paths.
        </p>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`notes-${source?.sourceId ?? "new"}`}>
          Compliance notes
        </Label>
        <Textarea
          id={`notes-${source?.sourceId ?? "new"}`}
          name="complianceNotes"
          defaultValue={source?.complianceNotes}
          minLength={3}
          maxLength={5_000}
          required
          className="min-h-28"
        />
      </div>
    </div>
  );
}

export function SourceForm({
  action,
  source,
}: {
  action: AdminFormAction;
  source?: JobSourceView;
}) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmedAction = useCallback<AdminFormAction>(
    async (previousState, formData) => {
      const result = await action(previousState, formData);
      setConfirmationOpen(false);
      return result;
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(
    confirmedAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `source-form-${source?.sourceId ?? "new"}`;
  const sourceLabel = source?.employerName ?? "this new source";

  function reviewSource() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) {
      form.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    setConfirmationOpen(true);
  }

  return (
    <form ref={formRef} id={formId} action={formAction} className="space-y-5">
      <SourceFields source={source} />
      <div className="flex flex-wrap items-center gap-3">
        <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <Button type="button" disabled={pending} onClick={reviewSource}>
            {pending ? "Saving…" : source ? "Save source" : "Add source"}
          </Button>
          <AlertDialogContent
            aria-label={`Confirm source configuration for ${sourceLabel}?`}
            className="max-w-md"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                Confirm source configuration for {sourceLabel}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                These audited settings can enable or disable collection from
                this source. Confirm that its access and compliance review are
                current.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" form={formId} disabled={pending}>
                {pending ? "Saving…" : "Confirm source changes"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {state.kind !== "idle" ? (
          <p
            role={state.kind === "success" ? "status" : "alert"}
            className="text-sm text-ink-secondary"
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

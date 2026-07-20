"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminFormAction } from "@/lib/admin/types";

const initialState = { kind: "idle" as const };

export function IngestionRequestForm({
  sourceId,
  action,
}: {
  sourceId: string;
  action: AdminFormAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="sourceId" value={sourceId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Requesting…" : "Request sync"}
      </Button>
      {state.kind !== "idle" ? (
        <p
          role={state.kind === "success" ? "status" : "alert"}
          className="text-xs text-ink-secondary"
        >
          {state.message}
          {state.kind === "success" && state.correlationId ? (
            <span className="ml-1 font-mono">
              {state.correlationId.slice(0, 8)}
            </span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}

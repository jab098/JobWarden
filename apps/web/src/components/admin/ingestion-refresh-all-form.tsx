"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminFormAction } from "@/lib/admin/types";

const initialState = { kind: "idle" as const };

/**
 * One button that queues a coalesced refresh for every enabled source, so an
 * administrator does not click each source in turn. The per-source buttons
 * remain for refreshing one board.
 */
export function IngestionRefreshAllForm({
  action,
  count,
}: {
  action: AdminFormAction;
  count: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button type="submit" size="sm" disabled={pending || count === 0}>
        {pending ? "Requesting…" : `Refresh all ${count} enabled sources`}
      </Button>
      {state.kind !== "idle" ? (
        <p
          role={state.kind === "success" ? "status" : "alert"}
          className="text-xs text-ink-secondary"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

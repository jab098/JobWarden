"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminFormAction } from "@/lib/admin/types";

const initialState = { kind: "idle" as const };

export function AccessSettingForm({
  enabled,
  action,
}: {
  enabled: boolean;
  action: AdminFormAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending
          ? "Updating…"
          : enabled
            ? "Pause new requests"
            : "Accept new requests"}
      </Button>
      {state.kind !== "idle" ? (
        <p
          role={state.kind === "success" ? "status" : "alert"}
          className="text-sm text-[#596173]"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

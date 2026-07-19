"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { NotificationsActionState } from "@/lib/notifications/types";

import { unsubscribeAction } from "./actions";

const initialState: NotificationsActionState = { kind: "idle" };

/**
 * The state change happens on submit, never on page load. A bare GET
 * unsubscribe is triggered by mail-scanner prefetch, which would unsubscribe
 * people who never clicked.
 */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    unsubscribeAction,
    initialState,
  );

  if (state.kind === "success") {
    return (
      <p role="status" className="mt-6 text-sm leading-6 text-[#596173]">
        {state.message} You can turn them back on from your career profile at
        any time.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending}>
        {pending ? "Turning off…" : "Turn off digest emails"}
      </Button>
      {state.kind === "idle" ? null : (
        <p role="alert" className="text-sm text-[#8a3328]">
          {state.message}
        </p>
      )}
    </form>
  );
}

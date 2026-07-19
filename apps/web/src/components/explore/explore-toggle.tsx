"use client";

import { useActionState } from "react";

import { setExploreEnabledAction } from "@/app/(protected)/explore/actions";
import { ActionFeedback } from "@/components/explore/action-feedback";
import { Button } from "@/components/ui/button";
import type { ExploreActionState } from "@/lib/explore/types";

const initialState: ExploreActionState = { kind: "idle" };

export function ExploreToggle({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(
    setExploreEnabledAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant={enabled ? "outline" : "default"}
        disabled={pending}
      >
        {enabled ? "Turn off Explore" : "Turn on Explore"}
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}

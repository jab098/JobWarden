"use client";

import { useActionState } from "react";

import { decideSuggestionAction } from "@/app/(protected)/profile/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProfileSuggestion } from "@jobwarden/domain";
import type { ProfileActionState } from "@/lib/profile/types";

const initialState: ProfileActionState = { kind: "idle" };

function SuggestionDecision({
  suggestion,
  readOnly,
}: {
  suggestion: ProfileSuggestion;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(
    decideSuggestionAction,
    initialState,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <Button
        type="submit"
        name="decision"
        value="accepted"
        size="sm"
        disabled={readOnly || pending}
      >
        Accept
      </Button>
      <Button
        type="submit"
        name="decision"
        value="rejected"
        size="sm"
        variant="outline"
        disabled={readOnly || pending}
      >
        Dismiss
      </Button>
      {state.kind !== "idle" ? (
        <span
          role={state.kind === "success" ? "status" : "alert"}
          className="text-xs text-[#596173]"
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function ProfileSuggestionList({
  suggestions,
  readOnly,
}: {
  suggestions: readonly ProfileSuggestion[];
  readOnly: boolean;
}) {
  return (
    <section
      aria-labelledby="profile-suggestions-heading"
      className="border-t border-[#dedbd2] py-8"
    >
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
        Proposed · accepted · rejected
      </p>
      <h2
        id="profile-suggestions-heading"
        className="mt-2 text-xl font-semibold tracking-[-0.02em]"
      >
        Suggested direction
      </h2>
      {suggestions.length === 0 ? (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#596173]">
          There are no suggestions to review. JobWarden never changes your
          seniority or search direction silently.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              className="grid gap-4 border-l-2 border-[#8da8cf] bg-[#f7f9fc] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="font-medium text-[#263248]">{suggestion.label}</p>
                <p className="mt-1 text-sm text-[#596173]">
                  Supported by {suggestion.evidenceItemIds.length}{" "}
                  {suggestion.evidenceItemIds.length === 1
                    ? "evidence item"
                    : "evidence items"}
                  . Confidence is supporting metadata, not a fit score.
                </p>
              </div>
              {suggestion.state === "proposed" ? (
                <SuggestionDecision
                  suggestion={suggestion}
                  readOnly={readOnly}
                />
              ) : (
                <Badge
                  variant="outline"
                  className={
                    suggestion.state === "accepted"
                      ? "rounded-sm border-[#9bc7ad] bg-[#f1f8f3] text-[#205f3b]"
                      : "rounded-sm border-[#d8aaa4] bg-[#fbf3f1] text-[#8a3328]"
                  }
                >
                  {suggestion.state === "accepted" ? "Accepted" : "Rejected"}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { Button } from "@/components/ui/button";

export default function ExploreError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white px-5 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">
        Explore is unavailable right now
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-ink-secondary">
        Your pathway suggestions could not be computed. Nothing was changed, and
        your career profile is unaffected.
      </p>
      <Button type="button" onClick={reset} size="sm" className="mt-6">
        Try again
      </Button>
    </div>
  );
}

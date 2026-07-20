"use client";

import { Button } from "@/components/ui/button";

export function JobsErrorView({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-7 lg:px-8">
      <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
        <h1 className="text-base font-semibold tracking-[-0.01em]">
          Jobs are temporarily unavailable
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
          The feed could not be loaded. Please try again in a moment.
        </p>
        <Button onClick={reset} className="mt-5">
          Try again
        </Button>
      </div>
    </section>
  );
}

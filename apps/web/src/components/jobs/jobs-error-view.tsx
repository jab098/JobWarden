"use client";

import { Button } from "@/components/ui/button";

export function JobsErrorView({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-3xl bg-white px-5 py-16">
      <h1 className="text-3xl font-semibold">
        Jobs are temporarily unavailable
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#596173]">
        The feed could not be loaded. Please try again in a moment.
      </p>
      <Button
        onClick={reset}
        className="mt-6 h-10 rounded-md bg-[#2458a6] text-white focus-visible:ring-2 focus-visible:ring-[#2458a6]"
      >
        Try again
      </Button>
    </section>
  );
}

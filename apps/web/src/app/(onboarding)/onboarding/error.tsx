"use client";

import { Button } from "@/components/ui/button";

export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#172033]">
        Setup is unavailable
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-[#596173]">
        Nothing you have entered so far is lost. Try again in a moment.
      </p>
      <Button type="button" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}

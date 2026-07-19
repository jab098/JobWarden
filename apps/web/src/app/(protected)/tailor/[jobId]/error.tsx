"use client";

import { Button } from "@/components/ui/button";

export default function TailorError({ reset }: { reset: () => void }) {
  return (
    <div className="px-5 py-10 lg:px-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#172033]">
        Tailoring is unavailable
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-[#596173]">
        Your CV and saved variants were not changed. Try again in a moment.
      </p>
      <Button type="button" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

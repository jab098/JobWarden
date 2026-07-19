"use client";

import { Button } from "@/components/ui/button";

export default function HomeError({ reset }: { reset: () => void }) {
  return (
    <div className="px-5 py-10 lg:px-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#172033]">
        Your activity summary is unavailable
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-[#596173]">
        Nothing was changed. Your applications, searches, and profile are all
        still available from the navigation.
      </p>
      <Button type="button" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

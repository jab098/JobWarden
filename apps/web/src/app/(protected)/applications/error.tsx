"use client";

import { Button } from "@/components/ui/button";

export default function ApplicationsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white px-5 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">
        Applications are unavailable right now
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-ink-secondary">
        Your tracked applications could not be loaded. Nothing was changed, and
        no application was submitted anywhere.
      </p>
      <Button type="button" onClick={reset} size="sm" className="mt-6">
        Try again
      </Button>
    </div>
  );
}

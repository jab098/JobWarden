"use client";

import { Button } from "@/components/ui/button";

export function AdminStateView({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:px-12">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-ink-secondary">
        {description}
      </p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </main>
  );
}

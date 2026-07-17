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
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#2458a6]">
        Administrator
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[#596173]">
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

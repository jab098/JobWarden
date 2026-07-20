"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type ProtectedErrorViewProps = {
  reset: () => void;
};

export function ProtectedErrorView({ reset }: ProtectedErrorViewProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12 text-foreground">
      <section
        role="alert"
        className="w-full max-w-xl border-t-2 border-[#b4473d] pt-8"
      >
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-[#a23c35]">
          Workspace unavailable
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
          We could not open the workspace
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-[#626b7a]">
          Your account details have not been changed. Try the request again; if
          the problem continues, return later.
        </p>
        <Button
          type="button"
          onClick={reset}
          className="mt-7 rounded-md bg-primary text-white hover:bg-primary/85"
        >
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </section>
    </main>
  );
}

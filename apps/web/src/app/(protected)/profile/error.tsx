"use client";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function ProfileError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell dataMode="supabase" activePath="profile">
      <div className="mx-auto min-h-screen max-w-6xl bg-white px-5 py-16 sm:px-8 lg:px-10">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#8f3f35]">
          Private data unavailable
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          Career profile is unavailable
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-secondary">
          Your profile details were not included in this error. Try loading the
          private workspace again.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </AppShell>
  );
}

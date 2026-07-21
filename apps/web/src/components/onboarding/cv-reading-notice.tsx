"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown while an uploaded CV is still being read.
 *
 * Two things went wrong without it. The reader had no way to tell whether
 * anything was happening — the upload card said "usually takes under a minute"
 * and then nothing on the page ever changed — and "Continue with my CV" stayed
 * pressable throughout, so they could carry themselves past their own CV before
 * it had produced anything to confirm.
 *
 * The page is a server component reading a database row, so it needs a reason
 * to re-render. `router.refresh()` re-runs the server render in place, keeping
 * the reader where they are. Polling stops as soon as the CV is read, so the
 * steady state costs nothing.
 *
 * It deliberately does not promise a time, count down, or draw a progress bar.
 * Extraction has no measurable progress to report, and inventing one would be a
 * number the product cannot stand behind. The control simply becomes usable.
 */
export function CvReadingNotice({ reading }: { reading: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!reading) return;

    const timer = setInterval(() => router.refresh(), 2_500);
    return () => clearInterval(timer);
  }, [reading, router]);

  if (!reading) return null;

  return (
    <p
      // Announced when it appears and again when it goes, so a screen-reader
      // user learns the CV is being read without watching for a spinner.
      role="status"
      aria-live="polite"
      className="mt-4 flex items-center gap-2.5 text-sm text-ink-secondary"
    >
      <span
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      />
      Reading your CV.
    </p>
  );
}

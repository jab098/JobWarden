"use client";

import { JobsErrorView } from "@/components/jobs/jobs-error-view";

export default function MatchesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <JobsErrorView reset={reset} />;
}

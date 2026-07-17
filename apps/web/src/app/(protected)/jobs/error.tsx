"use client";

import { JobsErrorView } from "@/components/jobs/jobs-error-view";

export default function JobsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <JobsErrorView reset={reset} />;
}

"use client";

import { useEffect } from "react";

import { ProtectedErrorView } from "@/components/auth/protected-error-view";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      "Protected workspace render failed",
      error.digest ?? "unknown",
    );
  }, [error]);

  return <ProtectedErrorView reset={reset} />;
}

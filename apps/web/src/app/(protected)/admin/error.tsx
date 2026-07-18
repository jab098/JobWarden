"use client";

import { AdminStateView } from "@/components/admin/admin-state-view";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AdminStateView
      title="Administrator data could not be loaded"
      description="The protected workspace is temporarily unavailable. No operation was applied."
      onRetry={reset}
    />
  );
}

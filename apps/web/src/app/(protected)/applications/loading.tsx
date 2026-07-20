import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingApplications() {
  return (
    <div role="status" className="mx-auto max-w-6xl px-4 py-5 lg:px-6">
      <span className="sr-only">Loading applications</span>
      <Skeleton className="h-7 w-48 max-w-full" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      <div className="mt-4 grid gap-2.5 lg:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}

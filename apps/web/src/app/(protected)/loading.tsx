import { Skeleton } from "@/components/ui/skeleton";

/**
 * The generic in-frame loading state. It renders inside the persistent
 * shell, shaped like a typical page: title line, meta line, then panels.
 * Access checking happens in the layout; the user never reads about it.
 */
export default function ProtectedLoading() {
  return (
    <div role="status" className="mx-auto max-w-list px-4 py-5 lg:px-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-7 w-48 max-w-full" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

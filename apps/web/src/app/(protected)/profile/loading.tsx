import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-5 lg:px-6">
      <Skeleton className="h-7 w-56 max-w-full" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-44" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

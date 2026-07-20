import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingExplore() {
  return (
    <div
      data-skeleton=""
      role="status"
      className="mx-auto max-w-list px-4 py-5 lg:px-6"
    >
      <span className="sr-only">Loading pathways</span>
      <Skeleton className="h-7 w-52 max-w-full" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    </div>
  );
}

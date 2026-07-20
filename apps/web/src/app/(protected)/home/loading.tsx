import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div
      data-skeleton=""
      role="status"
      className="mx-auto max-w-page px-4 py-5 lg:px-6"
    >
      <span className="sr-only">Preparing your activity summary</span>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="mt-2 h-4 w-full max-w-prose" />
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-24 w-full" />
        ))}
      </div>
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

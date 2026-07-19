import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="px-5 py-8 lg:px-8">
      <p className="sr-only">Preparing your activity summary</p>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="mt-3 h-4 w-full max-w-prose" />
      <div className="mt-6 space-y-6">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

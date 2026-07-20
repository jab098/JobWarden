import { Skeleton } from "@/components/ui/skeleton";

export default function TailorLoading() {
  return (
    <div data-skeleton="" className="px-5 py-8 lg:px-8">
      <p className="sr-only">Preparing your tailoring workspace</p>
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-4 h-4 w-full max-w-prose" />
      <div className="mt-6 space-y-4">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}

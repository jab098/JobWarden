import { Skeleton } from "@/components/ui/skeleton";

export function JobsLoadingView() {
  return (
    <section
      className="mx-auto max-w-5xl bg-white px-5 py-10"
      aria-labelledby="loading-heading"
    >
      <h1 id="loading-heading" className="text-3xl font-semibold">
        Loading UK jobs
      </h1>
      <div className="mt-8 divide-y divide-[#dedbd2]">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            data-testid="job-skeleton"
            className="space-y-3 py-6"
          >
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

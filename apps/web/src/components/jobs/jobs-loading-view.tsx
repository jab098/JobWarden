import { Skeleton } from "@/components/ui/skeleton";

export function JobsLoadingView() {
  return (
    <section
      className="mx-auto max-w-6xl px-5 py-7 lg:px-8"
      aria-labelledby="loading-heading"
    >
      <h1
        id="loading-heading"
        className="text-xl font-semibold tracking-[-0.02em]"
      >
        Loading UK jobs
      </h1>
      <div className="mt-5 flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            data-testid="job-skeleton"
            className="space-y-3 rounded-lg border border-border bg-card p-5"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The job-list skeleton, shared by the jobs feed and the matches feed. Both
 * arguments exist because those two routes are different widths and say
 * different things; a skeleton at the wrong width makes the layout jump when
 * the real content arrives.
 */
export function JobsLoadingView({
  title = "Loading UK jobs",
  width = "max-w-page",
}: {
  title?: string;
  width?: "max-w-page" | "max-w-list";
} = {}) {
  return (
    <section
      className={`mx-auto ${width === "max-w-list" ? "max-w-list" : "max-w-page"} px-4 py-5 lg:px-6`}
      aria-labelledby="loading-heading"
    >
      <h1
        id="loading-heading"
        className="text-xl font-semibold tracking-[-0.02em]"
      >
        {title}
      </h1>
      <div className="mt-5 flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            data-testid="job-skeleton"
            className="space-y-3 card-surface p-5"
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

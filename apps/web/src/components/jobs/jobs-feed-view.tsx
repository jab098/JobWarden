import Link from "next/link";

import { JobFilters } from "@/components/jobs/job-filters";
import { JobList } from "@/components/jobs/job-list";
import { createJobFiltersQueryString } from "@/lib/jobs/filters";
import type { JobFilters as Filters, JobsPageResult } from "@/lib/jobs/types";

function hasActiveFilters(filters: Filters) {
  return (
    filters.q !== "" ||
    filters.employment !== "all" ||
    filters.workingTime !== "all" ||
    filters.workplace !== "all" ||
    filters.ir35 !== "all"
  );
}

export function JobsFeedView({
  filters,
  result,
}: {
  filters: Filters;
  result: JobsPageResult;
}) {
  const active = hasActiveFilters(filters);
  const hasPreviousPage = result.page > 1;
  const hasNextPage = result.page * result.pageSize < result.total;
  const isOutOfRange = result.items.length === 0 && result.total > 0;
  const lastAvailablePage = Math.max(
    1,
    Math.ceil(result.total / result.pageSize),
  );
  const pageHref = (page: number) => {
    const query = createJobFiltersQueryString({ ...filters, page });
    return query ? `/jobs?${query}` : "/jobs";
  };
  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white">
      <header className="border-b border-[#dedbd2] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#697181]">
              United Kingdom only
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-4xl">
              UK jobs
            </h1>
          </div>
          <JobFilters filters={filters} variant="mobile" />
        </div>
        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#ece9e2] pt-4 text-sm text-[#596173]">
          <span className="font-medium text-[#263248]">
            {result.total} {result.total === 1 ? "job" : "jobs"}
          </span>
          <span>
            Latest listing update:{" "}
            {result.latestListingUpdate
              ? new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/London",
                }).format(new Date(result.latestListingUpdate))
              : "Not available"}
          </span>
          {result.dataMode === "fixtures" && (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[#7a5a20]">
              Development data
            </span>
          )}
        </div>
      </header>
      <div className="grid md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="hidden md:block">
          <JobFilters filters={filters} variant="desktop" />
        </div>
        <section aria-label="Job results" className="min-w-0">
          {result.items.length > 0 ? (
            <JobList jobs={result.items} />
          ) : (
            <div className="px-5 py-16 sm:px-8">
              <h2 className="text-2xl font-semibold tracking-[-0.025em]">
                {isOutOfRange
                  ? "No jobs on this page"
                  : active
                    ? "No jobs match these filters"
                    : "Listings are not available yet"}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
                {isOutOfRange
                  ? "Go to the last available page to continue browsing these UK roles."
                  : active
                    ? "Adjust or clear the filters to see other UK roles."
                    : "Permitted sources have not produced active listings yet. Check back after the next listing update."}
              </p>
              {active && (
                <Link
                  href="/jobs"
                  className="mt-6 inline-flex rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                >
                  Clear all filters
                </Link>
              )}
            </div>
          )}
          {(hasPreviousPage || hasNextPage) && (
            <nav
              aria-label="Job result pages"
              className="flex items-center justify-between border-t border-[#dedbd2] px-5 py-5 text-sm sm:px-7"
            >
              {hasPreviousPage ? (
                <Link
                  href={pageHref(
                    isOutOfRange ? lastAvailablePage : result.page - 1,
                  )}
                  className="rounded-sm font-semibold text-[#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                >
                  {isOutOfRange ? "← Last available page" : "← Previous"}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[#697181]">Page {result.page}</span>
              {hasNextPage ? (
                <Link
                  href={pageHref(result.page + 1)}
                  className="rounded-sm font-semibold text-[#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                >
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

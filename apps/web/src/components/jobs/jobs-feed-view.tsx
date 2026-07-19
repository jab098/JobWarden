import Link from "next/link";
import { X } from "lucide-react";

import { JobFilters } from "@/components/jobs/job-filters";
import { JobList } from "@/components/jobs/job-list";
import { activeJobFilters, jobsHref } from "@/lib/jobs/filters";
import type { JobFilters as Filters, JobsPageResult } from "@/lib/jobs/types";
import type { JobDecision } from "@/lib/target-feed/types";

const sortLabels: Record<Filters["sort"], string> = {
  newest: "Newest first",
  closing: "Closing soonest",
};

export function JobsFeedView({
  filters,
  result,
  decisions,
}: {
  filters: Filters;
  result: JobsPageResult;
  decisions: ReadonlyMap<string, JobDecision>;
}) {
  const active = activeJobFilters(filters);
  const hasPreviousPage = result.page > 1;
  const hasNextPage = result.page * result.pageSize < result.total;
  const isOutOfRange = result.items.length === 0 && result.total > 0;
  const lastAvailablePage = Math.max(
    1,
    Math.ceil(result.total / result.pageSize),
  );
  const pageHref = (page: number) => jobsHref({ ...filters, page });

  return (
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white">
      <header className="border-b border-[#dedbd2] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#697181]">
              United Kingdom only
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-4xl">
              Search jobs
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/matches"
              className="rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
            >
              My matches
            </Link>
            <JobFilters filters={filters} variant="mobile" />
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#ece9e2] pt-4 text-sm text-[#596173]">
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
          {/* Sort is a link rather than a control so the whole surface keeps
              working without JavaScript, exactly like the filters. */}
          <nav
            aria-label="Sort results"
            className="flex flex-wrap items-center gap-3"
          >
            {(Object.keys(sortLabels) as Filters["sort"][]).map((order) => (
              <Link
                key={order}
                href={jobsHref({ ...filters, sort: order, page: 1 })}
                aria-current={filters.sort === order ? "true" : undefined}
                className={`rounded-sm underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] ${
                  filters.sort === order
                    ? "font-semibold text-[#263248]"
                    : "text-[#2458a6] hover:underline"
                }`}
              >
                {sortLabels[order]}
              </Link>
            ))}
          </nav>
        </div>
        {active.length > 0 && (
          <ul
            aria-label="Active filters"
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            {active.map((filter) => (
              <li key={filter.key}>
                <Link
                  href={jobsHref(filter.clearedFilters)}
                  // first-letter, not capitalize: "£500+ per day" should not
                  // become "£500+ Per Day".
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#d8dde6] bg-[#faf9f6] px-3 py-1 text-xs font-medium text-[#40495a] first-letter:uppercase hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
                >
                  {filter.label}
                  <X aria-hidden="true" className="size-3" />
                  <span className="sr-only">Remove this filter</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/jobs"
                className="rounded-sm px-1 text-xs font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
              >
                Clear all
              </Link>
            </li>
          </ul>
        )}
      </header>
      <div className="grid md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="hidden md:block">
          <JobFilters filters={filters} variant="desktop" />
        </div>
        <section aria-label="Job results" className="min-w-0">
          {result.items.length > 0 ? (
            <JobList jobs={result.items} decisions={decisions} />
          ) : (
            <div className="px-5 py-16 sm:px-8">
              <h2 className="text-2xl font-semibold tracking-[-0.025em]">
                {isOutOfRange
                  ? "No jobs on this page"
                  : active.length > 0
                    ? "No jobs match this search"
                    : "Listings are not available yet"}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
                {isOutOfRange
                  ? "Go to the last available page to continue browsing these UK roles."
                  : active.length > 0
                    ? "Remove one of the filters above, or widen the search, to see other UK roles."
                    : "Permitted sources have not produced active listings yet. Check back after the next listing update."}
              </p>
              {active.length > 0 && (
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

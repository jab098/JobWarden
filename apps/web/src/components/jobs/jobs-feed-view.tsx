import Link from "next/link";
import { X } from "lucide-react";

import { JobFilters } from "@/components/jobs/job-filters";
import { JobList } from "@/components/jobs/job-list";
import { activeJobFilters, jobsHref } from "@/lib/jobs/filters";
import type { JobFilters as Filters, JobsPageResult } from "@/lib/jobs/types";
import type { JobDecision } from "@/lib/target-feed/types";
import type { JobSourceOption } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

const sortLabels: Record<Filters["sort"], string> = {
  newest: "Newest first",
  closing: "Closing soonest",
};

export function JobsFeedView({
  filters,
  result,
  decisions,
  sources = [],
}: {
  filters: Filters;
  result: JobsPageResult;
  decisions: ReadonlyMap<string, JobDecision>;
  sources?: readonly JobSourceOption[];
}) {
  const active = activeJobFilters(
    filters,
    new Map(sources.map((source) => [source.id, source.label])),
  );
  const hasPreviousPage = result.page > 1;
  const hasNextPage = result.page * result.pageSize < result.total;
  const isOutOfRange = result.items.length === 0 && result.total > 0;
  const lastAvailablePage = Math.max(
    1,
    Math.ceil(result.total / result.pageSize),
  );
  const pageHref = (page: number) => jobsHref({ ...filters, page });

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 lg:px-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Search jobs
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Browse every indexed UK listing, from every connected source.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/matches"
              className="rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              My matches
            </Link>
            <JobFilters filters={filters} variant="mobile" sources={sources} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-secondary">
          <span className="tnum font-medium text-foreground">
            {result.total} {result.total === 1 ? "job" : "jobs"}
          </span>
          <span className="text-xs text-ink-faint">
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
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warning"
              />
              Development data
            </span>
          )}
          {/* Sort is a set of links rather than a control so the whole surface
              keeps working without JavaScript, exactly like the filters. */}
          <nav
            aria-label="Sort results"
            className="ml-auto flex items-center rounded-lg border border-border bg-surface-sunken/60 p-0.5"
          >
            {(Object.keys(sortLabels) as Filters["sort"][]).map((order) => (
              <Link
                key={order}
                href={jobsHref({ ...filters, sort: order, page: 1 })}
                aria-current={filters.sort === order ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs outline-none transition-[background-color,color,box-shadow] duration-(--duration-quick) ease-(--ease-smooth-out) focus-visible:ring-2 focus-visible:ring-ring/60",
                  filters.sort === order
                    ? "bg-card font-medium text-foreground shadow-[0_1px_3px_rgba(16,20,28,0.1)] ring-1 ring-border"
                    : "text-ink-secondary hover:text-foreground",
                )}
              >
                {sortLabels[order]}
              </Link>
            ))}
          </nav>
        </div>
        {active.length > 0 && (
          <ul
            aria-label="Active filters"
            className="mt-3 flex flex-wrap items-center gap-1.5"
          >
            {active.map((filter) => (
              <li key={filter.key}>
                <Link
                  href={jobsHref(filter.clearedFilters)}
                  // first-letter, not capitalize: "£500+ per day" should not
                  // become "£500+ Per Day".
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-2 pl-2.5 text-xs font-medium text-ink-secondary outline-none transition-[border-color,color] duration-150 first-letter:uppercase hover:border-danger/40 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {filter.label}
                  <X
                    aria-hidden="true"
                    strokeWidth={2}
                    className="size-3 text-ink-faint transition-colors duration-150 group-hover:text-danger"
                  />
                  <span className="sr-only">Remove this filter</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/jobs"
                className="rounded-sm px-1 text-xs font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Clear all
              </Link>
            </li>
          </ul>
        )}
      </header>
      <div className="mt-4">
        <div className="hidden md:block">
          <JobFilters filters={filters} variant="desktop" sources={sources} />
        </div>
        <section aria-label="Job results" className="mt-3 min-w-0">
          {result.items.length > 0 ? (
            <JobList jobs={result.items} decisions={decisions} />
          ) : (
            <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
              <h2 className="text-base font-semibold tracking-[-0.01em]">
                {isOutOfRange
                  ? "No jobs on this page"
                  : active.length > 0
                    ? "No jobs match this search"
                    : "Listings are not available yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
                {isOutOfRange
                  ? "Go to the last available page to continue browsing these UK roles."
                  : active.length > 0
                    ? "Remove one of the filters above, or widen the search, to see other UK roles."
                    : "Permitted sources have not produced active listings yet. Check back after the next listing update."}
              </p>
              {active.length > 0 && (
                <Link
                  href="/jobs"
                  className="mt-5 inline-flex rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Clear all filters
                </Link>
              )}
            </div>
          )}
          {(hasPreviousPage || hasNextPage) && (
            <nav
              aria-label="Job result pages"
              className="mt-4 flex items-center justify-between text-sm"
            >
              {hasPreviousPage ? (
                <Link
                  href={pageHref(
                    isOutOfRange ? lastAvailablePage : result.page - 1,
                  )}
                  className="rounded-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {isOutOfRange ? "← Last available page" : "← Previous"}
                </Link>
              ) : (
                <span />
              )}
              <span className="tnum text-xs text-ink-faint">
                Page {result.page}
              </span>
              {hasNextPage ? (
                <Link
                  href={pageHref(result.page + 1)}
                  className="rounded-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
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

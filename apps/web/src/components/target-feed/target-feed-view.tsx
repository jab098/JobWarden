import Link from "next/link";

import { TargetFeedItem } from "@/components/target-feed/target-feed-item";
import { matchesHref } from "@/lib/target-feed/view";
import type { TargetFeedResult } from "@/lib/target-feed/types";

function formatFreshness(latestListingUpdate: string | null): string {
  if (!latestListingUpdate) return "Catalogue freshness not available";
  return `Latest listing update: ${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(latestListingUpdate))}`;
}

export function TargetFeedView({
  result,
  includeDismissed,
  latestListingUpdate,
}: {
  result: TargetFeedResult;
  includeDismissed: boolean;
  latestListingUpdate: string | null;
}) {
  const hasProfiles = result.enabledProfileNames.length > 0;
  const count = result.items.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 lg:px-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Your matches
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Listings scored against your enabled search profiles, with the
              evidence behind every score.
            </p>
          </div>
          <Link
            href="/jobs"
            className="rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Search all UK jobs
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-secondary">
          <span className="tnum font-medium text-foreground">
            {count} {count === 1 ? "match" : "matches"}
          </span>
          {hasProfiles ? (
            <span className="text-xs">
              Matched to {result.enabledProfileNames.join(", ")}
            </span>
          ) : null}
          <span className="text-xs text-ink-faint">
            {formatFreshness(latestListingUpdate)}
          </span>
          {result.dataMode === "fixtures" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warning"
              />
              Development data
            </span>
          ) : null}
          {hasProfiles ? (
            <Link
              href={
                includeDismissed
                  ? matchesHref({})
                  : matchesHref({ includeDismissed: true })
              }
              className="ml-auto rounded-sm text-xs font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {includeDismissed ? "Hide dismissed" : "Include dismissed"}
            </Link>
          ) : null}
        </div>
      </header>

      <section aria-label="Target feed results" className="mt-4 min-w-0">
        {!hasProfiles ? (
          <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
            <h2 className="text-base font-semibold tracking-[-0.01em]">
              No enabled search profile yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
              Matches score UK listings against your enabled search profiles.
              Set one up and enable it to see scored matches with the evidence
              behind each score. You can search every UK listing without one.
            </p>
            <Link
              href="/profile"
              className="mt-5 inline-flex rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Set up your career profile
            </Link>
          </div>
        ) : count === 0 ? (
          <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
            <h2 className="text-base font-semibold tracking-[-0.01em]">
              No jobs match your profile yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
              Every indexed UK listing was excluded by your eligibility gates or
              no listings are available yet. This is the honest result, not a
              hidden filter. Check back after the next listing update or widen
              your search profile. Every UK listing is still browsable from
              search.
            </p>
            {!includeDismissed ? (
              <Link
                href={matchesHref({ includeDismissed: true })}
                className="mt-5 inline-flex rounded-sm text-sm font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Include dismissed jobs
              </Link>
            ) : null}
          </div>
        ) : (
          <ul>
            {result.items.map((item) => (
              <TargetFeedItem
                key={item.job.id}
                item={item}
                includeDismissed={includeDismissed}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

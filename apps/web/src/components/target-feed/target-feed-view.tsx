import Link from "next/link";

import { TargetFeedItem } from "@/components/target-feed/target-feed-item";
import { targetFeedHref } from "@/lib/target-feed/view";
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
    <div className="mx-auto min-h-screen max-w-[92rem] bg-white">
      <header className="border-b border-[#dedbd2] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#697181]">
              United Kingdom only
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-4xl">
              Target feed
            </h1>
          </div>
          <Link
            href={targetFeedHref({ view: "all" })}
            className="rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
          >
            Browse all jobs
          </Link>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#ece9e2] pt-4 text-sm text-[#596173]">
          <span className="font-medium text-[#263248]">
            {count} {count === 1 ? "match" : "matches"}
          </span>
          {hasProfiles ? (
            <span>Matched to {result.enabledProfileNames.join(", ")}</span>
          ) : null}
          <span>{formatFreshness(latestListingUpdate)}</span>
          {result.dataMode === "fixtures" ? (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[#7a5a20]">
              Development data
            </span>
          ) : null}
          {hasProfiles ? (
            <Link
              href={
                includeDismissed
                  ? targetFeedHref({})
                  : targetFeedHref({ includeDismissed: true })
              }
              className="rounded-sm font-medium text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
            >
              {includeDismissed ? "Hide dismissed" : "Include dismissed"}
            </Link>
          ) : null}
        </div>
      </header>

      <section aria-label="Target feed results" className="min-w-0">
        {!hasProfiles ? (
          <div className="px-5 py-16 sm:px-8">
            <h2 className="text-2xl font-semibold tracking-[-0.025em]">
              No enabled search profile yet
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
              The target feed scores UK listings against your enabled search
              profiles. Set one up and enable it to see scored matches with the
              evidence behind each score.
            </p>
            <Link
              href="/profile"
              className="mt-6 inline-flex rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
            >
              Set up your career profile
            </Link>
          </div>
        ) : count === 0 ? (
          <div className="px-5 py-16 sm:px-8">
            <h2 className="text-2xl font-semibold tracking-[-0.025em]">
              No jobs match your profile yet
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#596173]">
              Every indexed UK listing was excluded by your eligibility gates or
              no listings are available yet. This is the honest result, not a
              hidden filter. Check back after the next listing update or widen
              your search profile.
            </p>
            {!includeDismissed ? (
              <Link
                href={targetFeedHref({ includeDismissed: true })}
                className="mt-6 inline-flex rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
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

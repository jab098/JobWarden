import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { TargetFeedView } from "@/components/target-feed/target-feed-view";
import { parseJobFilters } from "@/lib/jobs/filters";
import { getJobsRepository } from "@/lib/jobs/get-repository";
import { getTargetFeedRepository } from "@/lib/target-feed/get-repository";
import { parseIncludeDismissed } from "@/lib/target-feed/view";

export const metadata: Metadata = { title: "Matches" };

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const includeDismissed = parseIncludeDismissed(params.includeDismissed);

  const [feed, listResult] = await Promise.all([
    (await getTargetFeedRepository()).getFeed({ includeDismissed }),
    // Only for catalogue freshness: the feed scores its own candidates, so this
    // says when the listings behind those scores were last refreshed.
    (await getJobsRepository()).list(parseJobFilters({})),
  ]);

  return (
    <AppShell dataMode={feed.dataMode} activePath="matches">
      <TargetFeedView
        result={feed}
        includeDismissed={includeDismissed}
        latestListingUpdate={listResult.latestListingUpdate}
      />
    </AppShell>
  );
}

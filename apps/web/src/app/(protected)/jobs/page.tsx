import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { JobsFeedView } from "@/components/jobs/jobs-feed-view";
import { TargetFeedView } from "@/components/target-feed/target-feed-view";
import { parseJobFilters } from "@/lib/jobs/filters";
import { getJobsRepository } from "@/lib/jobs/get-repository";
import { getTargetFeedRepository } from "@/lib/target-feed/get-repository";
import { parseIncludeDismissed, resolveJobsView } from "@/lib/target-feed/view";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseJobFilters(params);
  const includeDismissed = parseIncludeDismissed(params.includeDismissed);
  const viewParam = typeof params.view === "string" ? params.view : undefined;

  const feed =
    viewParam === "all"
      ? null
      : await (await getTargetFeedRepository()).getFeed({ includeDismissed });
  const view = resolveJobsView(
    viewParam,
    feed?.enabledProfileNames.length ?? 0,
  );

  const listResult = await (await getJobsRepository()).list(filters);

  if (view === "all" || feed === null) {
    return (
      <AppShell dataMode={listResult.dataMode}>
        <JobsFeedView filters={filters} result={listResult} />
      </AppShell>
    );
  }

  return (
    <AppShell dataMode={feed.dataMode}>
      <TargetFeedView
        result={feed}
        includeDismissed={includeDismissed}
        latestListingUpdate={listResult.latestListingUpdate}
      />
    </AppShell>
  );
}

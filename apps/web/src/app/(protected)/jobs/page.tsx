import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { JobsFeedView } from "@/components/jobs/jobs-feed-view";
import { parseJobFilters } from "@/lib/jobs/filters";
import { getJobsRepository } from "@/lib/jobs/get-repository";
import { getTargetFeedRepository } from "@/lib/target-feed/get-repository";

export const metadata: Metadata = { title: "Search jobs" };

export default async function SearchJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseJobFilters(await searchParams);

  // Decisions are read alongside the page of results so a job already saved
  // from the matches feed says so here, rather than offering to save it twice.
  const [listResult, decisions] = await Promise.all([
    (await getJobsRepository()).list(filters),
    (await getTargetFeedRepository()).getDecisions(),
  ]);

  return (
    <AppShell dataMode={listResult.dataMode} activePath="jobs">
      <JobsFeedView
        filters={filters}
        result={listResult}
        decisions={decisions}
      />
    </AppShell>
  );
}

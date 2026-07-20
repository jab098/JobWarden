import type { Metadata } from "next";

import { JobsFeedView } from "@/components/jobs/jobs-feed-view";
import { parseJobFilters } from "@/lib/jobs/filters";
import { getJobsRepository } from "@/lib/jobs/get-repository";
import { getSourcesRepository } from "@/lib/sources/get-repository";
import { getTargetFeedRepository } from "@/lib/target-feed/get-repository";
import type { JobDecision } from "@/lib/target-feed/types";
import type { JobSourceOption } from "@/lib/sources/types";

export const metadata: Metadata = { title: "Search jobs" };

export default async function SearchJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseJobFilters(await searchParams);

  // Decisions are read alongside the page of results so a job already saved
  // from the matches feed says so here, rather than offering to save it twice.
  //
  // Browsing the catalogue must not depend on a personalisation read: if the
  // decisions are unavailable the listings still render, with save controls in
  // their unsaved state, rather than the whole search failing. The source
  // registry degrades the same way: no registry, no source control.
  const [listResult, decisions, sourcesResult] = await Promise.all([
    (await getJobsRepository()).list(filters),
    (await getTargetFeedRepository())
      .getDecisions()
      .catch(() => new Map<string, JobDecision>()),
    (await getSourcesRepository()).listEnabled().catch(() => ({
      sources: [] as readonly JobSourceOption[],
      dataMode: "supabase" as const,
    })),
  ]);

  return (
    <JobsFeedView
      filters={filters}
      result={listResult}
      decisions={decisions}
      sources={sourcesResult.sources}
    />
  );
}

import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { JobsFeedView } from "@/components/jobs/jobs-feed-view";
import { parseJobFilters } from "@/lib/jobs/filters";
import { getJobsRepository } from "@/lib/jobs/get-repository";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseJobFilters(await searchParams);
  const repository = await getJobsRepository();
  const result = await repository.list(filters);

  return (
    <AppShell dataMode={result.dataMode}>
      <JobsFeedView filters={filters} result={result} />
    </AppShell>
  );
}

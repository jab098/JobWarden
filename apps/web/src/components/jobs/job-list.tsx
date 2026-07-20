import { JobCard } from "@/components/jobs/job-card";
import type { JobListItem } from "@/lib/jobs/types";
import type { JobDecision } from "@/lib/target-feed/types";

export function JobList({
  jobs,
  decisions,
}: {
  jobs: readonly JobListItem[];
  decisions: ReadonlyMap<string, JobDecision>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          decision={decisions.get(job.id) ?? null}
        />
      ))}
    </div>
  );
}

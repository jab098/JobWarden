import { JobCard } from "@/components/jobs/job-card";
import type { JobListItem } from "@/lib/jobs/types";

export function JobList({ jobs }: { jobs: readonly JobListItem[] }) {
  return (
    <div>
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

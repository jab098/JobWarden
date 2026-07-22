import Link from "next/link";

import { JobAttribution } from "@/components/jobs/job-attribution";
import {
  formatClosingSoon,
  formatPostedAge,
} from "@/components/jobs/job-format";
import { JobFacts } from "@/components/jobs/job-facts";
import { JobSaveButton } from "@/components/jobs/job-save-button";
import type { JobListItem } from "@/lib/jobs/types";
import type { JobDecision } from "@/lib/target-feed/types";

export function JobCard({
  job,
  decision,
}: {
  job: JobListItem;
  decision: JobDecision | null;
}) {
  const closing = formatClosingSoon(job.closesAt);
  return (
    <article className="card-surface p-4 [overflow-wrap:anywhere] card-interactive sm:p-5">
      <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-foreground">
        <Link
          href={`/jobs/${job.id}`}
          className="rounded-sm outline-none transition-colors duration-150 hover:text-link focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {job.title}
        </Link>
      </h2>
      <p className="mt-0.5 text-sm text-ink-secondary">{job.employer}</p>
      <JobFacts job={job} className="mt-3" />
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3.5">
        <JobSaveButton jobId={job.id} decision={decision} />
        <span className="text-xs text-ink-faint">
          {formatPostedAge(job.postedAt)}
        </span>
        {closing ? (
          <span className="text-xs font-medium text-warning">{closing}</span>
        ) : null}
        <JobAttribution sourceProvider={job.sourceProvider} />
        <Link
          href={`/jobs/${job.id}`}
          className="ml-auto rounded-sm text-xs font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          View details
        </Link>
      </div>
    </article>
  );
}

import Link from "next/link";

import {
  formatClosingSoon,
  formatCompensation,
  formatCompensationProvenance,
  formatIr35,
  formatJobLabel,
  formatPostedAge,
} from "@/components/jobs/job-format";
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
  const compensation = formatCompensation(job);
  const compensationProvenance = formatCompensationProvenance(job);
  const ir35 = formatIr35(job);
  const closing = formatClosingSoon(job.closesAt);
  return (
    <article className="border-b border-[#dedbd2] px-5 py-6 [overflow-wrap:anywhere] transition-colors hover:bg-[#fbfaf7] sm:px-7">
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#172033]">
        {job.title}
      </h2>
      <p className="mt-1 text-sm font-medium text-[#4e5768]">{job.employer}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#596173]">
        <span>{job.location}</span>
        <span aria-hidden="true">·</span>
        <span>{formatJobLabel(job.workplaceType, "Workplace not stated")}</span>
        <span aria-hidden="true">·</span>
        <span>
          {formatJobLabel(job.employmentType, "Employment not stated")}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {formatJobLabel(job.workingTime, "Working time not stated")}
        </span>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-[#263248]">
          {compensation ?? "Salary not stated"}
        </span>
        {compensation && (
          <span className="font-mono text-[0.66rem] uppercase tracking-[0.1em] text-[#697181]">
            {compensationProvenance}
          </span>
        )}
        {ir35 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{ir35}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{formatPostedAge(job.postedAt)}</span>
        {closing && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#8a5a1a]">{closing}</span>
          </>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <JobSaveButton jobId={job.id} decision={decision} />
        <Link
          href={`/jobs/${job.id}`}
          className="rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          View details
        </Link>
      </div>
    </article>
  );
}

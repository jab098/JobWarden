import Link from "next/link";

import {
  formatCompensation,
  formatIr35,
  formatJobLabel,
  formatPostedAge,
} from "@/components/jobs/job-format";
import type { JobListItem } from "@/lib/jobs/types";

export function JobCard({ job }: { job: JobListItem }) {
  const compensation = formatCompensation(job);
  const ir35 = formatIr35(job);
  return (
    <article className="border-b border-[#dedbd2] px-5 py-6 transition-colors hover:bg-[#fbfaf7] sm:px-7">
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
        {compensation && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#263248]">{compensation}</span>
          </>
        )}
        {ir35 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{ir35}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{formatPostedAge(job.postedAt)}</span>
      </div>
      <Link
        href={`/jobs/${job.id}`}
        className="mt-5 inline-flex rounded-sm text-sm font-semibold text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
      >
        View details
      </Link>
    </article>
  );
}

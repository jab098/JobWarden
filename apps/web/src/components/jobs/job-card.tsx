import Link from "next/link";

import type { JobListItem } from "@/lib/jobs/types";

const labels: Record<string, string> = {
  permanent: "Permanent",
  fixed_term: "Fixed term",
  contract: "Contract",
  temporary: "Temporary",
  apprenticeship: "Apprenticeship",
  internship: "Internship",
  casual: "Casual",
  zero_hours: "Zero hours",
  full_time: "Full time",
  part_time: "Part time",
  flexible: "Flexible",
  onsite: "On site",
  hybrid: "Hybrid",
  remote: "Remote",
};

function formatCompensation(job: JobListItem): string | null {
  if (
    job.compensationCurrency !== "GBP" ||
    job.compensationPeriod === "unknown"
  )
    return null;
  if (job.compensationMinimum === null && job.compensationMaximum === null)
    return null;
  const money = (value: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(value / 100);
  const amount =
    job.compensationMinimum !== null && job.compensationMaximum !== null
      ? `${money(job.compensationMinimum)}–${money(job.compensationMaximum)}`
      : money((job.compensationMinimum ?? job.compensationMaximum)!);
  return `${amount} per ${job.compensationPeriod}`;
}

function postedAge(postedAt: string | null): string {
  if (!postedAt) return "Posting date not stated";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000),
  );
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}

export function JobCard({ job }: { job: JobListItem }) {
  const compensation = formatCompensation(job);
  return (
    <article className="border-b border-[#dedbd2] px-5 py-6 transition-colors hover:bg-[#fbfaf7] sm:px-7">
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#172033]">
        {job.title}
      </h2>
      <p className="mt-1 text-sm font-medium text-[#4e5768]">{job.employer}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#596173]">
        <span>{job.location}</span>
        <span aria-hidden="true">·</span>
        <span>{labels[job.workplaceType] ?? "Workplace not stated"}</span>
        <span aria-hidden="true">·</span>
        <span>{labels[job.employmentType] ?? "Employment not stated"}</span>
        <span aria-hidden="true">·</span>
        <span>{labels[job.workingTime] ?? "Working time not stated"}</span>
        {compensation && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#263248]">{compensation}</span>
          </>
        )}
        {job.employmentType === "contract" && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {job.ir35Status === "unknown"
                ? "IR35 status not stated"
                : `${job.ir35Status === "inside" ? "Inside" : job.ir35Status === "outside" ? "Outside" : "Not applicable"} IR35`}
            </span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{postedAge(job.postedAt)}</span>
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

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  formatCompensation,
  formatIr35,
  formatJobLabel,
  formatPostedAge,
} from "@/components/jobs/job-format";
import type { JobDetail } from "@/lib/jobs/types";

export function JobDetailView({
  job,
  dataMode,
}: {
  job: JobDetail;
  dataMode: "supabase" | "fixtures";
}) {
  const compensation = formatCompensation(job);
  const ir35 = formatIr35(job);
  return (
    <article className="mx-auto max-w-4xl bg-white px-5 py-8 [overflow-wrap:anywhere] sm:px-8 lg:px-12 lg:py-12">
      <Link
        href="/jobs"
        className="rounded-sm text-sm text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
      >
        ← Back to UK jobs
      </Link>
      <p className="mt-10 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
        {dataMode === "fixtures" ? "Development data" : "UK listing"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-5xl">
        {job.title}
      </h1>
      <p className="mt-3 text-lg text-[#4e5768]">
        {job.employer} · {job.location}
      </p>
      <div className="mt-8 flex flex-wrap gap-x-3 gap-y-2 border-y border-[#dedbd2] py-6 text-sm text-[#596173]">
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
            <span>{compensation}</span>
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
      <section className="mt-10" aria-labelledby="description-heading">
        <h2 id="description-heading" className="text-xl font-semibold">
          Role description
        </h2>
        <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[#354054]">
          {job.descriptionText}
        </p>
      </section>
      <section
        className="mt-10 border-t border-[#dedbd2] pt-8"
        aria-labelledby="eligibility-heading"
      >
        <h2 id="eligibility-heading" className="text-xl font-semibold">
          UK eligibility evidence
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[#4e5768]">
          {job.ukEligibilityEvidence.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      </section>
      <dl className="mt-10 grid gap-4 border-t border-[#dedbd2] pt-8 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#697181]">Source</dt>
          <dd className="mt-1 font-medium">{job.sourceLabel}</dd>
        </div>
        <div>
          <dt className="text-[#697181]">Last checked</dt>
          <dd className="mt-1 font-medium">
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/London",
            }).format(new Date(job.lastSeenAt))}
          </dd>
        </div>
      </dl>
      <a
        href={job.applicationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 inline-flex h-11 items-center gap-2 rounded-md bg-[#2458a6] px-5 text-sm font-semibold text-white hover:bg-[#1d477f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6] focus-visible:ring-offset-2"
      >
        Apply on employer website <ArrowUpRight aria-hidden="true" />
      </a>
    </article>
  );
}

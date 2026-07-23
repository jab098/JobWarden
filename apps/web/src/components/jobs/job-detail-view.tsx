import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { matchJobSkills } from "@jobwarden/domain";

import { JobDescription } from "@/components/jobs/job-description";
import { formatPostedAge } from "@/components/jobs/job-format";
import { JobFacts } from "@/components/jobs/job-facts";
import { sourceAttribution } from "@/lib/jobs/source-attribution";
import type { JobDetail } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

export function JobDetailView({
  job,
  dataMode,
  actions,
  userSkills = [],
}: {
  job: JobDetail;
  dataMode: "supabase" | "fixtures";
  /**
   * The secondary things a reader can do with this listing. They sit with the
   * job facts rather than above the page, so the card holds every action and
   * the back link stays the first thing on the page.
   */
  actions?: React.ReactNode;
  /**
   * The reader's own skills, lifted from their profile, so the skills this
   * listing names can be marked with the ones they already have. Empty for a
   * signed-out or profile-less reader, which simply leaves every skill neutral.
   */
  userSkills?: readonly string[];
}) {
  const skills = matchJobSkills(
    `${job.title} ${job.descriptionText}`,
    userSkills,
  );
  const mineCount = skills.filter((skill) => skill.mine).length;

  return (
    <div className="mx-auto max-w-list px-4 py-5 sm:px-6">
      <Link
        href="/jobs"
        className="rounded-sm text-sm text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        ← Back to UK jobs
      </Link>
      <article className="mt-4 card-surface p-5 [overflow-wrap:anywhere] sm:p-8">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {job.title}
              </h1>
              <p className="mt-1.5 text-sm font-medium text-ink-secondary">
                {job.employer}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-faint">
                <span>{formatPostedAge(job.postedAt)}</span>
                {dataMode === "fixtures" ? (
                  <span>· Development data</span>
                ) : null}
              </p>
            </div>
            <a
              href={job.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-[background-color,transform] duration-150 ease-(--ease-smooth-out) hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Apply on employer website
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          </div>
          <JobFacts job={job} className="mt-5" />
          {actions ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
              {actions}
            </div>
          ) : null}
        </header>
        {skills.length > 0 ? (
          <section
            className="mt-7 border-t border-border pt-6"
            aria-labelledby="skills-heading"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="skills-heading"
                className="text-sm font-semibold text-foreground"
              >
                Skills
              </h2>
              {mineCount > 0 ? (
                <span className="text-xs text-ink-faint">
                  {mineCount} on your profile
                </span>
              ) : null}
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <li
                  key={skill.label}
                  className={cn(
                    "rounded-sm px-2 py-0.5 text-xs font-medium",
                    skill.mine
                      ? "border border-success/35 bg-success/10 text-success"
                      : "border border-border bg-surface-sunken text-ink-secondary",
                  )}
                >
                  {skill.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section
          className="mt-7 border-t border-border pt-6"
          aria-labelledby="description-heading"
        >
          <h2
            id="description-heading"
            className="text-sm font-semibold text-foreground"
          >
            Role description
          </h2>
          <JobDescription text={job.descriptionText} className="mt-3" />
        </section>
        <section
          className="mt-7 border-t border-border pt-6"
          aria-labelledby="eligibility-heading"
        >
          <h2
            id="eligibility-heading"
            className="text-sm font-semibold text-foreground"
          >
            UK eligibility evidence
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-secondary">
            {job.ukEligibilityEvidence.map((evidence) => (
              <li key={evidence}>{evidence}</li>
            ))}
          </ul>
        </section>
        <dl className="mt-7 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-faint">Source</dt>
            <dd className="mt-1 font-medium text-foreground">
              {sourceAttribution(job.sourceProvider) ?? job.sourceLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Last checked</dt>
            <dd className="tnum mt-1 font-mono text-[0.8rem] text-foreground">
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/London",
              }).format(new Date(job.lastSeenAt))}
            </dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

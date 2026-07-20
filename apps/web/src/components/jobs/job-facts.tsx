import { MapPin } from "lucide-react";

import {
  formatCompensation,
  formatCompensationProvenance,
  formatIr35,
  formatJobLabel,
} from "@/components/jobs/job-format";
import type { JobListItem } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/**
 * The fields the fact row needs. JobDetail satisfies this too, so one designed
 * row serves search results, matches, and the detail page identically.
 */
export type JobFactsSource = Pick<
  JobListItem,
  | "location"
  | "workplaceType"
  | "employmentType"
  | "workingTime"
  | "ir35Status"
  | "compensationMinimum"
  | "compensationMaximum"
  | "compensationCurrency"
  | "compensationPeriod"
  | "compensationProvenance"
>;

function Dot() {
  return (
    <span aria-hidden="true" className="text-ink-faint/70">
      ·
    </span>
  );
}

/**
 * Key job facts in the one stable scan order used everywhere: location,
 * workplace, employment type, working time, compensation, IR35. Location and
 * compensation carry the visual weight; the rest stays quiet.
 */
export function JobFacts({
  job,
  className,
}: {
  job: JobFactsSource;
  className?: string;
}) {
  const compensation = formatCompensation(job);
  const provenance = formatCompensationProvenance(job);
  const ir35 = formatIr35(job);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-2 text-xs",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        <MapPin
          aria-hidden="true"
          strokeWidth={1.75}
          className="size-3.5 text-ink-faint"
        />
        {job.location}
      </span>
      <Dot />
      <span className="text-ink-secondary">
        {formatJobLabel(job.workplaceType, "Workplace not stated")}
      </span>
      <Dot />
      <span className="text-ink-secondary">
        {formatJobLabel(job.employmentType, "Employment not stated")}
      </span>
      <Dot />
      <span className="text-ink-secondary">
        {formatJobLabel(job.workingTime, "Working time not stated")}
      </span>
      {compensation ? (
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "tnum inline-flex items-center rounded-md px-2 py-1 font-mono text-xs font-medium",
              job.compensationProvenance === "advertised" &&
                "bg-success-surface text-success",
              job.compensationProvenance === "estimated" &&
                "bg-warning-surface text-warning",
              job.compensationProvenance === "unknown" &&
                "bg-muted text-ink-secondary",
            )}
          >
            {compensation}
          </span>
          <span className="text-[0.7rem] text-ink-faint">{provenance}</span>
        </span>
      ) : (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs text-ink-faint">
          Salary not stated
        </span>
      )}
      {ir35 ? (
        <span className="inline-flex items-center rounded-sm border border-border px-1.5 py-0.5 text-[0.7rem] font-medium text-ink-secondary">
          {ir35}
        </span>
      ) : null}
    </div>
  );
}

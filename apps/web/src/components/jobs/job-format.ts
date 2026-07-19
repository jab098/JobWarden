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

export function formatJobLabel(value: string, fallback: string): string {
  return labels[value] ?? fallback;
}

function formatPence(value: number): string {
  const includesPence = value % 100 !== 0;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: includesPence ? 2 : 0,
    maximumFractionDigits: includesPence ? 2 : 0,
  }).format(value / 100);
}

export function formatCompensation(job: JobListItem): string | null {
  if (
    job.compensationCurrency !== "GBP" ||
    job.compensationPeriod === "unknown" ||
    (job.compensationMinimum === null && job.compensationMaximum === null)
  ) {
    return null;
  }

  let amount: string;
  if (job.compensationMinimum !== null && job.compensationMaximum !== null) {
    amount =
      job.compensationMinimum === job.compensationMaximum
        ? formatPence(job.compensationMinimum)
        : `${formatPence(job.compensationMinimum)}–${formatPence(job.compensationMaximum)}`;
  } else {
    amount = formatPence((job.compensationMinimum ?? job.compensationMaximum)!);
  }

  return `${amount} per ${job.compensationPeriod}`;
}

export function formatCompensationProvenance(job: JobListItem): string {
  switch (job.compensationProvenance) {
    case "advertised":
      return "Advertised salary";
    case "estimated":
      return "Estimated salary";
    case "unknown":
      return "Salary not stated";
  }
}

export function formatIr35(job: JobListItem): string | null {
  if (job.employmentType !== "contract") return null;
  switch (job.ir35Status) {
    case "inside":
      return "Inside IR35";
    case "outside":
      return "Outside IR35";
    case "not_applicable":
      return "IR35 not applicable";
    case "unknown":
      return "IR35 status not stated";
  }
}

/**
 * Only stated when it is close enough to act on. A closing date months away is
 * noise on a results row, and one that is absent is not a deadline of "never".
 */
export function formatClosingSoon(
  closesAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!closesAt) return null;
  const days = Math.ceil(
    (new Date(closesAt).getTime() - now.getTime()) / 86_400_000,
  );
  if (days < 0 || days > 14) return null;
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
}

export function formatPostedAge(postedAt: string | null): string {
  if (!postedAt) return "Posting date not stated";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000),
  );
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  return `Posted ${days} days ago`;
}

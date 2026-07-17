import type { NormalisedJob } from "@jobwarden/domain";

type NormalisedJobContent = Omit<NormalisedJob, "contentHash">;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashNormalisedJobContent(
  job: NormalisedJobContent,
): Promise<string> {
  const canonicalContent = {
    sourceId: job.sourceId,
    providerJobId: job.providerJobId,
    title: job.title,
    employer: job.employer,
    descriptionText: job.descriptionText,
    applicationUrl: job.applicationUrl,
    countryCode: job.countryCode,
    ukEligibilityEvidence: job.ukEligibilityEvidence,
    employmentType: job.employmentType,
    workingTime: job.workingTime,
    workplaceType: job.workplaceType,
    ir35Status: job.ir35Status,
    compensationRaw: job.compensationRaw,
    compensationMinimum: job.compensationMinimum,
    compensationMaximum: job.compensationMaximum,
    compensationCurrency: job.compensationCurrency,
    compensationPeriod: job.compensationPeriod,
    postedAt: job.postedAt,
    closesAt: job.closesAt,
  };

  return sha256Hex(JSON.stringify(canonicalContent));
}

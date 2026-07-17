import { normalisedJobSchema } from "@jobwarden/domain";
import { describe, expect, it } from "vitest";

import mixedFixture from "./fixtures/greenhouse-mixed.json";
import ukFixture from "./fixtures/greenhouse-uk.json";
import {
  GreenhouseAdapter,
  type JobSource,
  type ProviderJob,
  normaliseProviderJob,
} from "./index";

const source: JobSource = {
  id: "5f32d2ad-a91d-467b-a491-1e2193e69d18",
  provider: "greenhouse",
  boardToken: "acme",
  employerName: "Acme Ltd",
  allowedHosts: ["Boards.Greenhouse.io"],
};

const baseJob: ProviderJob = {
  providerJobId: "normalise-1",
  title: "Platform Engineer",
  location: "London, England",
  descriptionHtml: "<p>Permanent full-time hybrid role in London.</p>",
  absoluteUrl: "https://boards.greenhouse.io/acme/jobs/normalise-1",
  updatedAt: "2026-07-17T10:00:00Z",
  metadataText: [],
};

async function eligibleJob(job: ProviderJob, jobSource: JobSource = source) {
  const result = await normaliseProviderJob(jobSource, job);
  expect(result.outcome).toBe("eligible");
  if (result.outcome !== "eligible") throw new Error("Expected eligible job");
  return result.job;
}

describe("Greenhouse normalisation", () => {
  it("publishes only the two explicitly UK-eligible fixture jobs", async () => {
    const adapter = new GreenhouseAdapter({
      fetch: async () =>
        new Response(JSON.stringify(mixedFixture), {
          headers: { "content-type": "application/json" },
        }),
      sleep: async () => undefined,
      random: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });
    const providerJobs = await adapter.fetchJobs(source);

    const results = await Promise.all(
      providerJobs.map((job) => normaliseProviderJob(source, job)),
    );

    expect(
      results.filter(({ outcome }) => outcome === "eligible"),
    ).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "excluded",
          reason: "non_uk",
          providerJobId: "1003",
        }),
        expect.objectContaining({
          outcome: "quarantined",
          reason: "ambiguous_uk_eligibility",
          providerJobId: "1004",
        }),
        expect.objectContaining({
          outcome: "excluded",
          reason: "non_uk",
          providerJobId: "1005",
        }),
      ]),
    );

    const eligible = results.flatMap((result) =>
      result.outcome === "eligible" ? [result.job] : [],
    );
    expect(
      eligible.every((job) => normalisedJobSchema.safeParse(job).success),
    ).toBe(true);
    expect(eligible.map((job) => job.postedAt)).toEqual([null, null]);
    expect(eligible[0]).toMatchObject({
      employmentType: "permanent",
      workingTime: "full_time",
      workplaceType: "hybrid",
      compensationRaw: "Salary: £60,000 per year",
      compensationMinimum: 6_000_000,
      compensationMaximum: null,
      compensationCurrency: "GBP",
      compensationPeriod: "year",
    });
    expect(eligible[1]).toMatchObject({
      employmentType: "contract",
      workplaceType: "remote",
      ir35Status: "outside",
      compensationMinimum: 55_000,
      compensationPeriod: "day",
    });
  });

  it("discards executable and hidden HTML while producing decoded plain text", async () => {
    const job = await eligibleJob({
      ...baseJob,
      descriptionHtml:
        '<script>STEAL()</script><style>.secret{display:block}</style><noscript>HIDDEN</noscript><template>CLONED</template><p onclick="attack()">Hello &amp; welcome</p><div>to <strong>JobWarden</strong>.</div>',
    });

    expect(job.descriptionText).toBe("Hello & welcome to JobWarden.");
    expect(job.descriptionText).not.toMatch(
      /STEAL|secret|HIDDEN|CLONED|onclick|<[^>]*>/,
    );
  });

  it("decodes Greenhouse entity-encoded markup before removing tags and attributes", async () => {
    const adapter = new GreenhouseAdapter({
      fetch: async () =>
        new Response(JSON.stringify(ukFixture), {
          headers: { "content-type": "application/json" },
        }),
      sleep: async () => undefined,
      random: () => 0,
      createTimeoutSignal: () => new AbortController().signal,
    });
    const [providerJob] = await adapter.fetchJobs(source);

    const job = await eligibleJob(providerJob);

    expect(job.descriptionText).toBe(
      "Permanent full-time hybrid role at AT&T. Build reliable platforms for our customers.",
    );
    expect(job.descriptionText).not.toMatch(
      /<[^>]*>|class=|data-track|href=|onclick|tracker\.example|evil\.example|STEAL/,
    );
  });

  it.each([
    "javascript:alert(1)",
    "http://boards.greenhouse.io/acme/jobs/1",
    "https://boards.greenhouse.io.evil.example/acme/jobs/1",
    "https://user:password@boards.greenhouse.io/acme/jobs/1",
    "not a URL",
  ])("quarantines an unsafe application URL: %s", async (absoluteUrl) => {
    await expect(
      normaliseProviderJob(source, { ...baseJob, absoluteUrl }),
    ).resolves.toEqual({
      outcome: "quarantined",
      reason: "invalid_application_url",
      providerJobId: baseJob.providerJobId,
    });
  });

  it("accepts a case-normalised exact host or dot-subdomain", async () => {
    const exact = await normaliseProviderJob(source, baseJob);
    const subdomain = await normaliseProviderJob(source, {
      ...baseJob,
      providerJobId: "normalise-2",
      absoluteUrl: "https://apply.boards.greenhouse.io/acme/jobs/normalise-2",
    });

    expect(exact.outcome).toBe("eligible");
    expect(subdomain.outcome).toBe("eligible");
  });

  it("produces the same hash when metadata order changes", async () => {
    const first = await eligibleJob({
      ...baseJob,
      metadataText: ["Salary: £70,000 per year", "Team: Platform"],
    });
    const reordered = await eligibleJob({
      ...baseJob,
      metadataText: ["Team: Platform", "Salary: £70,000 per year"],
    });

    expect(reordered).toEqual(first);
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not hash provider update timestamps as posting or content data", async () => {
    const first = await eligibleJob(baseJob);
    const seenLater = await eligibleJob({
      ...baseJob,
      updatedAt: "2026-07-18T12:00:00Z",
    });

    expect(first.postedAt).toBeNull();
    expect(seenLater.postedAt).toBeNull();
    expect(seenLater.contentHash).toBe(first.contentHash);
  });

  it("changes the hash when normalised content changes", async () => {
    const first = await eligibleJob(baseJob);
    const changed = await eligibleJob({
      ...baseJob,
      title: "Senior Platform Engineer",
    });

    expect(changed.contentHash).not.toBe(first.contentHash);
  });

  it("parses explicit compensation and leaves missing compensation null", async () => {
    const compensated = await eligibleJob({
      ...baseJob,
      metadataText: ["Salary: £450-£550 per day"],
    });
    const missing = await eligibleJob(baseJob);

    expect(compensated).toMatchObject({
      compensationRaw: "Salary: £450-£550 per day",
      compensationMinimum: 45_000,
      compensationMaximum: 55_000,
      compensationCurrency: "GBP",
      compensationPeriod: "day",
    });
    expect(missing).toMatchObject({
      compensationRaw: null,
      compensationMinimum: null,
      compensationMaximum: null,
      compensationCurrency: null,
      compensationPeriod: "unknown",
    });
  });
});

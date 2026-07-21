import { describe, expect, it } from "vitest";

import {
  AshbyAdapter,
  LeverAdapter,
  TeachingVacanciesAdapter,
  normaliseProviderJob,
  type JobSource,
} from "./index";

/**
 * The same advertised salary must publish as the same figure from every source.
 *
 * This file exists because it did not. Ashby and Teaching Vacancies both fed
 * `parseCompensation`'s **minor units** into `ProviderCompensation`, which is
 * **major units**, and `normaliseProviderJob` multiplied by 100 again — so a
 * £50,000 advert published as £5,000,000 under `advertised` provenance, the
 * strongest claim the product makes.
 *
 * Every adapter had a compensation test and all of them passed, because each
 * asserted its own adapter's **intermediate** value rather than the figure that
 * reaches the database. Ashby's even carried a confident comment asserting the
 * wrong convention, copied from Teaching Vacancies, which had the same bug.
 *
 * So these assertions deliberately run the whole path — adapter, then
 * normaliser — and compare providers against each other. A unit mistake in one
 * adapter cannot hide here, because Lever and Reed receive their numbers already
 * in major units and are the control.
 */

const base = {
  id: "4d3c2b1a-9f8e-4d6c-8b4a-3f2e1d0c9b8a",
  employerName: "Fictional UK Employer Ltd",
};

function respond(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

async function publishedMinimum(
  source: JobSource,
  adapter: { fetchJobs: (s: JobSource) => Promise<{ jobs: unknown[] }> },
): Promise<number | null> {
  const result = await adapter.fetchJobs(source);
  const normalised = await normaliseProviderJob(
    source,
    result.jobs[0] as never,
  );
  return normalised.outcome === "eligible"
    ? normalised.job.compensationMinimum
    : null;
}

describe("an advertised salary publishes identically from every source", () => {
  // £50,000, stored as minor units by the normaliser.
  const expected = 5_000_000;

  it("Lever — the control, whose provider supplies major units directly", async () => {
    const source = {
      ...base,
      provider: "lever",
      boardToken: "x",
      allowedHosts: ["jobs.lever.co"],
    } as JobSource;

    const adapter = new LeverAdapter({
      fetch: respond([
        {
          id: "l1",
          text: "Engineer",
          hostedUrl: "https://jobs.lever.co/x/l1",
          applyUrl: "https://jobs.lever.co/x/l1/apply",
          categories: { location: "Manchester" },
          description: "<p>A UK role in Manchester.</p>",
          salaryRange: {
            currency: "GBP",
            interval: "per-year-salary",
            min: 50000,
            max: 70000,
          },
        },
      ]),
      sleep: async () => {},
    });

    expect(await publishedMinimum(source, adapter as never)).toBe(expected);
  });

  it("Ashby — parses the figure out of free text", async () => {
    const source = {
      ...base,
      provider: "ashby",
      boardToken: "x",
      allowedHosts: ["jobs.ashbyhq.com"],
    } as JobSource;

    const adapter = new AshbyAdapter({
      fetch: respond({
        jobs: [
          {
            id: "a1",
            title: "Engineer",
            location: "Manchester",
            jobUrl: "https://jobs.ashbyhq.com/x/a1",
            applyUrl: "https://jobs.ashbyhq.com/x/a1/apply",
            descriptionHtml: "<p>A UK role in Manchester.</p>",
            compensation: {
              compensationTierSummary: "£50,000 - £70,000 per year",
            },
          },
        ],
      }),
      sleep: async () => {},
    });

    expect(await publishedMinimum(source, adapter as never)).toBe(expected);
  });

  it("Teaching Vacancies — parses the figure out of free text", async () => {
    const source = {
      ...base,
      provider: "teaching_vacancies",
      boardToken: "gb-discovery",
      allowedHosts: ["teaching-vacancies.service.gov.uk"],
    } as JobSource;

    const adapter = new TeachingVacanciesAdapter({
      fetch: respond({
        data: [
          {
            title: "Teacher",
            url: "https://teaching-vacancies.service.gov.uk/jobs/abc",
            description: "A UK role in Manchester.",
            jobLocation: { address: { addressLocality: "Manchester" } },
            baseSalary: { value: { value: "£50,000 - £70,000 per year" } },
          },
        ],
        links: { next: null },
      }),
      sleep: async () => {},
    });

    expect(await publishedMinimum(source, adapter as never)).toBe(expected);
  });

  // An hourly rate is where a naive pounds/pence conversion loses precision, so
  // the round trip is pinned at two decimal places as well.
  it("keeps an hourly rate exact through the round trip", async () => {
    const source = {
      ...base,
      provider: "ashby",
      boardToken: "x",
      allowedHosts: ["jobs.ashbyhq.com"],
    } as JobSource;

    const adapter = new AshbyAdapter({
      fetch: respond({
        jobs: [
          {
            id: "a2",
            title: "Assistant",
            location: "Manchester",
            jobUrl: "https://jobs.ashbyhq.com/x/a2",
            applyUrl: "https://jobs.ashbyhq.com/x/a2/apply",
            descriptionHtml: "<p>A UK role in Manchester.</p>",
            compensation: { compensationTierSummary: "£12.71 per hour" },
          },
        ],
      }),
      sleep: async () => {},
    });

    // £12.71 is 1271 minor units, not 1270 or 1272.
    expect(await publishedMinimum(source, adapter as never)).toBe(1271);
  });
});

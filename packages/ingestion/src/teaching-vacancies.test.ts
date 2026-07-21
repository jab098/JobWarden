import { describe, expect, it } from "vitest";

import pageOne from "./fixtures/teaching-vacancies-page-one.json" with { type: "json" };
import { AdapterError } from "./transport.ts";
import { TeachingVacanciesAdapter } from "./teaching-vacancies.ts";
import type { JobSource } from "./types.ts";

const source: JobSource = {
  id: "7f2c8a1e-0000-4000-8000-000000000001",
  provider: "teaching_vacancies",
  boardToken: "gb-discovery",
  employerName: "Teaching Vacancies",
  allowedHosts: ["teaching-vacancies.service.gov.uk"],
};

const endpoint = "https://teaching-vacancies.service.gov.uk/api/v1/jobs.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function adapterReturning(
  responses: Response[],
  options: { maxPages?: number } = {},
) {
  const calls: string[] = [];
  const adapter = new TeachingVacanciesAdapter({
    maxPages: options.maxPages ?? 5,
    sleep: async () => {},
    now: () => Date.parse("2026-07-21T09:00:00.000Z"),
    createTimeoutSignal: () => new AbortController().signal,
    fetch: (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const next = responses.shift();
      if (!next) throw new Error("unexpected extra request");
      return next;
    }) as typeof fetch,
  });
  return { adapter, calls };
}

describe("Teaching Vacancies adapter", () => {
  it("refuses a source that is not a Teaching Vacancies source", async () => {
    const { adapter } = adapterReturning([]);
    await expect(
      adapter.fetchJobs({ ...source, provider: "greenhouse" } as JobSource),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it("reports incremental coverage, so an unread advert never closes a job", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    await expect(adapter.fetchJobs(source)).resolves.toMatchObject({
      coverage: "incremental",
    });
  });

  it("builds location evidence from the address the advert states", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    const { jobs } = await adapter.fetchJobs(source);

    expect(jobs[0]!.location).toBe("Bedford, East of England, MK45 5JH");
    // No addressCountry. Synthesising a location from a provider's country
    // assertion would make that assertion the eligibility evidence.
    expect(jobs[0]!.location).not.toContain("GB");
  });

  it("carries a postcode as the only location evidence when no locality is given", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    const { jobs } = await adapter.fetchJobs(source);
    const postcodeOnly = jobs.find((job) =>
      job.title.includes("Teaching Assistant"),
    );

    expect(postcodeOnly!.location).toBe("EC2A 4NE");
  });

  it("keeps an advertised salary as advertised without trusting unitText", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    const { jobs } = await adapter.fetchJobs(source);

    // The fixture serves an hourly rate with unitText "YEAR", exactly as the
    // live service does. The period must come from the employer's own words.
    expect(jobs[0]!.compensation).toMatchObject({
      provenance: "advertised",
      currency: "GBP",
      period: "hour",
    });
    expect(jobs[1]!.compensation).toMatchObject({
      provenance: "advertised",
      period: "year",
      minimum: 3165000,
      maximum: 4360700,
    });
  });

  it("leaves an advert with no stated salary unknown rather than estimating one", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    const { jobs } = await adapter.fetchJobs(source);
    const noSalary = jobs.find((job) => job.title.includes("Cover Supervisor"));

    expect(noSalary!.compensation).toMatchObject({
      provenance: "unknown",
      raw: null,
      minimum: null,
      maximum: null,
    });
  });

  it("keeps unparseable salary text advertised with no invented figure", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    const { jobs } = await adapter.fetchJobs(source);
    const scaleOnly = jobs.find((job) =>
      job.title.includes("Teaching Assistant"),
    );

    expect(scaleOnly!.compensation).toMatchObject({
      provenance: "advertised",
      minimum: null,
      maximum: null,
    });
    expect(scaleOnly!.compensation?.raw).toContain("Fictional pay scale");
  });

  it("does not read a working-time token as a contract type", async () => {
    const { adapter } = adapterReturning(
      [jsonResponse({ ...pageOne, links: { next: null } })],
      { maxPages: 1 },
    );

    const { jobs } = await adapter.fetchJobs(source);

    // FULL_TIME says nothing about whether the post is permanent.
    expect(jobs[1]!.employmentType).toBe("unknown");
    expect(jobs[1]!.workingTime).toBe("full_time");
    // TEMPORARY does state a contract type.
    const temporary = jobs.find((job) =>
      job.title.includes("Cover Supervisor"),
    );
    expect(temporary!.employmentType).toBe("temporary");
  });

  it("follows the provider's next link up to the page bound", async () => {
    const { adapter, calls } = adapterReturning(
      [
        jsonResponse(pageOne),
        jsonResponse({ ...pageOne, links: { next: null } }),
      ],
      { maxPages: 2 },
    );

    const { jobs } = await adapter.fetchJobs(source);

    expect(calls).toEqual([endpoint, `${endpoint}?page=2`]);
    expect(jobs).toHaveLength(8);
  });

  it("stops at the page bound even when more pages remain", async () => {
    const { adapter, calls } = adapterReturning([jsonResponse(pageOne)], {
      maxPages: 1,
    });

    await adapter.fetchJobs(source);

    expect(calls).toEqual([endpoint]);
  });

  it("refuses to follow a next link that leaves the provider's endpoint", async () => {
    const { adapter, calls } = adapterReturning(
      [
        jsonResponse({
          ...pageOne,
          links: { next: "https://attacker.invalid/api/v1/jobs.json?page=2" },
        }),
      ],
      { maxPages: 5 },
    );

    const { jobs } = await adapter.fetchJobs(source);

    expect(calls).toEqual([endpoint]);
    expect(jobs).toHaveLength(4);
  });

  it("rejects a response whose shape does not match, without leaking it", async () => {
    const { adapter } = adapterReturning([
      jsonResponse({ data: [{ title: 123, url: null }] }),
    ]);

    await expect(adapter.fetchJobs(source)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects invalid JSON syntax", async () => {
    const { adapter } = adapterReturning([
      new Response("not json", { status: 200 }),
    ]);

    await expect(adapter.fetchJobs(source)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("raises a bounded http error rather than retrying a client fault", async () => {
    const { adapter, calls } = adapterReturning([
      jsonResponse({ error: "gone" }, 404),
    ]);

    await expect(adapter.fetchJobs(source)).rejects.toMatchObject({
      code: "http_error",
      status: 404,
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a transient status within the attempt bound", async () => {
    const { adapter, calls } = adapterReturning([
      jsonResponse({ error: "slow down" }, 429),
      jsonResponse({ ...pageOne, links: { next: null } }),
    ]);

    const { jobs } = await adapter.fetchJobs(source);

    expect(calls).toHaveLength(2);
    expect(jobs).toHaveLength(4);
  });
});

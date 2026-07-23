import { describe, expect, it } from "vitest";

import { AdzunaAdapter, type JobSource } from "./index";

const source: JobSource = {
  id: "6c1a9f77-2f8e-4a1e-9d3c-1b2a3c4d5e6f",
  provider: "adzuna",
  boardToken: "gb-discovery",
  employerName: "Adzuna",
  allowedHosts: ["www.adzuna.co.uk"],
};

/** The exact shape the GB endpoint returned on 2026-07-21, field for field. */
function result(overrides: Record<string, unknown> = {}) {
  return {
    id: "5792974745",
    title: "Art Teacher/ Instructor",
    description: "We put wellbeing first by giving our teams more time…",
    created: "2026-07-08T19:58:52Z",
    redirect_url:
      "https://www.adzuna.co.uk/jobs/land/ad/5792974745?se=abc&utm_medium=api",
    company: { display_name: "Outcomes First Group" },
    location: {
      display_name: "Littleworth, Worcestershire",
      area: ["UK", "West Midlands", "Worcestershire", "Littleworth"],
    },
    category: { label: "Teaching Jobs" },
    contract_time: "full_time",
    salary_min: 0,
    salary_max: 39000,
    salary_is_predicted: "0",
    ...overrides,
  };
}

function adapterReturning(body: unknown) {
  return new AdzunaAdapter({
    appId: "fictional-id",
    appKey: "fictional-key",
    maxPages: 1,
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
}

describe("Adzuna GB adapter", () => {
  it("reads the fields the provider actually sends", async () => {
    const { jobs, coverage } = await adapterReturning({
      results: [result()],
      count: 726430,
    }).fetchJobs(source);

    expect(coverage).toBe("incremental");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      providerJobId: "5792974745",
      title: "Art Teacher/ Instructor",
      // The location stays the honest settlement; the UK jurisdiction the GB
      // endpoint asserts (area[0]="UK") rides on assertsUkJurisdiction, which is
      // what lets the classifier publish small places (Littleworth) the
      // gazetteer does not carry.
      location: "Littleworth, Worcestershire",
      assertsUkJurisdiction: true,
      employerName: "Outcomes First Group",
      updatedAt: "2026-07-08T19:58:52Z",
    });
  });

  it("treats a zero minimum as no minimum, not a salary of nothing", async () => {
    // 42% of live adverts send salary_min: 0 beside a real maximum. Recording
    // it would advertise a £0 floor.
    const { jobs } = await adapterReturning({ results: [result()] }).fetchJobs(
      source,
    );

    expect(jobs[0]!.compensation).toMatchObject({
      minimum: null,
      maximum: 39000,
      currency: "GBP",
      provenance: "advertised",
    });
  });

  it("records a predicted salary as estimated, never advertised", async () => {
    // 26% of live adverts are Adzuna's model output, not the employer's words.
    const { jobs } = await adapterReturning({
      results: [
        result({
          salary_min: 25869.99,
          salary_max: 25869.99,
          salary_is_predicted: "1",
        }),
      ],
    }).fetchJobs(source);

    expect(jobs[0]!.compensation).toMatchObject({
      provenance: "estimated",
      minimum: 25869.99,
      maximum: 25869.99,
    });
  });

  it("leaves the period unknown rather than assuming a year", async () => {
    // The same live sample carried 45000 and 29. The index mean is £43,346,
    // which makes most look annual — and that is the reasoning that published
    // an hourly Teaching Vacancies rate as a yearly one.
    const { jobs } = await adapterReturning({
      results: [result({ salary_min: 29, salary_max: 29 })],
    }).fetchJobs(source);

    expect(jobs[0]!.compensation?.period).toBe("unknown");
  });

  it("carries no figures at all when the provider states none", async () => {
    // The database refuses unknown provenance beside any figure, currency
    // included, and one such row aborts the whole batch.
    const { jobs } = await adapterReturning({
      results: [result({ salary_min: 0, salary_max: 0 })],
    }).fetchJobs(source);

    expect(jobs[0]!.compensation).toMatchObject({
      provenance: "unknown",
      minimum: null,
      maximum: null,
      currency: null,
      observedAt: null,
    });
  });

  it("asserts UK jurisdiction from area[0] while keeping the honest location", async () => {
    // area[0] is always the literal "UK" on the GB endpoint. Reading it is
    // deliberate (owner-authorised): it rides on assertsUkJurisdiction, the
    // evidence the classifier needs to publish small UK settlements the
    // gazetteer does not carry — while the location stays the named place.
    const { jobs } = await adapterReturning({
      results: [
        result({
          location: { display_name: "Padanaram, Forfar", area: ["UK"] },
        }),
      ],
    }).fetchJobs(source);

    expect(jobs[0]!.location).toBe("Padanaram, Forfar");
    expect(jobs[0]!.assertsUkJurisdiction).toBe(true);
  });

  it("falls back to the most specific area when no place is named, still asserting UK", async () => {
    const { jobs } = await adapterReturning({
      results: [
        result({
          location: { display_name: null, area: ["UK", "Scotland", "Fife"] },
        }),
      ],
    }).fetchJobs(source);

    expect(jobs[0]!.location).toBe("Fife");
    expect(jobs[0]!.assertsUkJurisdiction).toBe(true);
  });

  it("withholds the UK assertion from a Crown dependency Adzuna surfaces under GB", async () => {
    // Isle of Man / Channel Islands are outside the UK for right-to-work. They
    // must never carry the jurisdiction assertion; the classifier also refuses
    // them by name.
    const { jobs } = await adapterReturning({
      results: [
        result({
          location: {
            display_name: "Douglas, Isle of Man",
            area: ["UK", "Isle of Man", "Douglas"],
          },
        }),
      ],
    }).fetchJobs(source);

    expect(jobs[0]!.location).toBe("Douglas, Isle of Man");
    expect(jobs[0]!.assertsUkJurisdiction).toBe(false);
  });

  it("refuses a source that is not Adzuna", async () => {
    await expect(
      adapterReturning({ results: [] }).fetchJobs({
        ...source,
        provider: "greenhouse",
      } as JobSource),
    ).rejects.toMatchObject({ code: "configuration_error" });
  });
});

import { describe, expect, it } from "vitest";

import {
  AdapterError,
  AshbyAdapter,
  type AshbyAdapterOptions,
  type JobSource,
  classifyEmploymentType,
  classifyWorkingTime,
  normaliseProviderJob,
  toAshbyCompensation,
  toAshbyLocation,
} from "./index";

const source: JobSource = {
  id: "2a1b3c4d-5e6f-7081-92a3-b4c5d6e7f809",
  provider: "ashby",
  boardToken: "fictional-uk-employer",
  employerName: "Fictional UK Employer Ltd",
  allowedHosts: ["jobs.ashbyhq.com"],
};

/**
 * Entirely fictional. No real employer, posting, or person appears here, and no
 * request in this file leaves the process.
 */
function posting(overrides: Record<string, unknown> = {}) {
  return {
    id: "cccccccc-1111-2222-3333-dddddddddddd",
    title: "Platform Engineer",
    location: "Manchester",
    department: "Engineering",
    team: "Platform",
    employmentType: "FullTime",
    publishedAt: "2026-07-01T09:00:00.000Z",
    isListed: true,
    jobUrl: "https://jobs.ashbyhq.com/fictional-uk-employer/cccccccc",
    applyUrl: "https://jobs.ashbyhq.com/fictional-uk-employer/cccccccc/apply",
    descriptionHtml: "<p>Work on our UK platform in Manchester.</p>",
    ...overrides,
  };
}

function adapter(
  body: unknown,
  status = 200,
  options: AshbyAdapterOptions = {},
) {
  const requested: URL[] = [];
  const instance = new AshbyAdapter({
    fetch: (async (input: URL) => {
      requested.push(input);
      return new Response(
        typeof body === "string" ? body : JSON.stringify(body),
        { status, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse("2026-07-21T12:00:00.000Z"),
    ...options,
  });
  return { instance, requested };
}

describe("Ashby adapter", () => {
  it("refuses a source that is not an Ashby source", async () => {
    const { instance } = adapter({ jobs: [] });
    await expect(
      instance.fetchJobs({ ...source, provider: "lever" } as JobSource),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it("reports complete coverage, because one request returns the whole board", async () => {
    const { instance } = adapter({ jobs: [posting()] });
    const result = await instance.fetchJobs(source);
    expect(result.coverage).toBe("complete");
  });

  it("requests compensation explicitly, or a stated salary would read as unknown", async () => {
    const { instance, requested } = adapter({ jobs: [posting()] });
    await instance.fetchJobs(source);
    expect(requested[0]?.searchParams.get("includeCompensation")).toBe("true");
  });

  // Trap 1. `isListed: false` means the posting is not on the employer's board.
  it("does not publish a posting Ashby marks as unlisted", async () => {
    const { instance } = adapter({
      jobs: [
        posting({ id: "listed" }),
        posting({ id: "gone", isListed: false }),
      ],
    });
    const result = await instance.fetchJobs(source);
    expect(result.jobs.map((job) => job.providerJobId)).toEqual(["listed"]);
  });

  it("treats an absent isListed flag as listed, which is how a live posting is served", async () => {
    const { instance } = adapter({ jobs: [posting({ isListed: undefined })] });
    const result = await instance.fetchJobs(source);
    expect(result.jobs).toHaveLength(1);
  });

  // Trap 2. The live sample's first posting is `isRemote: true` with
  // `location: "Remote - European Union"` — remote and explicitly not the UK.
  // A remote role needs explicit UK permission; these fields are never
  // evidence, and the classifier must refuse this rather than publish it.
  it("does not publish a remote posting whose location is not the UK", async () => {
    const { instance } = adapter({
      jobs: [
        posting({
          location: "Remote - European Union",
          isRemote: true,
          workplaceType: "Remote",
          descriptionHtml: "<p>A fully remote role on our platform team.</p>",
        }),
      ],
    });
    const result = await instance.fetchJobs(source);
    const normalised = await normaliseProviderJob(source, result.jobs[0]!);
    expect(normalised.outcome).not.toBe("eligible");
  });

  it("publishes a posting whose location names a UK place", async () => {
    const { instance } = adapter({ jobs: [posting()] });
    const result = await instance.fetchJobs(source);
    const normalised = await normaliseProviderJob(source, result.jobs[0]!);
    expect(normalised.outcome).toBe("eligible");
  });

  // Trap 3. Ashby serves these as empty strings rather than omitting them.
  it("treats empty-string address fields as missing rather than present", () => {
    expect(
      toAshbyLocation(
        posting({
          location: "",
          address: {
            postalAddress: {
              addressLocality: "",
              addressRegion: "",
              postalCode: "",
            },
          },
        }) as never,
      ),
    ).toBe("");
  });

  it("falls back to the postal address when the advert states no location", () => {
    expect(
      toAshbyLocation(
        posting({
          location: "",
          address: {
            postalAddress: {
              addressLocality: "Leeds",
              addressRegion: "West Yorkshire",
              postalCode: "LS1 4AP",
            },
          },
        }) as never,
      ),
    ).toBe("Leeds, West Yorkshire, LS1 4AP");
  });

  // Appending would lose publications rather than gain them: eligibility needs
  // every label recognised, so "Manchester, Head Office" quarantines where
  // "Manchester" alone publishes.
  it("does not append the postal address to a location the advert already states", () => {
    expect(
      toAshbyLocation(
        posting({
          location: "Manchester",
          address: { postalAddress: { addressLocality: "Head Office" } },
        }) as never,
      ),
    ).toBe("Manchester");
  });

  // Trap 6. Reading secondary locations would change what a listing's location
  // means, which is its own decision rather than a detail of this adapter.
  it("ignores secondaryLocations entirely", () => {
    expect(
      toAshbyLocation(
        posting({
          location: "Manchester",
          secondaryLocations: [{ location: "Berlin" }],
        }) as never,
      ),
    ).toBe("Manchester");
  });

  // Trap 4. Ashby's vocabulary states working time, not contract type.
  it("does not read a working-time token as a contract type", () => {
    expect(classifyEmploymentType("FullTime")).toBe("unknown");
    expect(classifyWorkingTime("FullTime")).toBe("full_time");
    expect(classifyEmploymentType("PartTime")).toBe("unknown");
    expect(classifyWorkingTime("PartTime")).toBe("part_time");
  });

  it("reads a contract token as a contract type and states no working time", () => {
    expect(classifyEmploymentType("Contract")).toBe("contract");
    expect(classifyWorkingTime("Contract")).toBe("unknown");
    expect(classifyEmploymentType("Intern")).toBe("internship");
  });

  // Trap 5. The summaries are free text, so they go to the shared parser.
  it("keeps a stated salary advertised with the figures the advert gives", () => {
    const result = toAshbyCompensation(
      { compensationTierSummary: "£55,000 - £65,000 per year" },
      "2026-07-21T12:00:00.000Z",
    );
    expect(result.provenance).toBe("advertised");
    // Minor units, as every compensation figure in this codebase is: £55,000 is
    // 5,500,000 pence. Rounding to pounds here would lose the precision the
    // normaliser deliberately preserves.
    expect(result.minimum).toBe(5_500_000);
    expect(result.maximum).toBe(6_500_000);
    expect(result.currency).toBe("GBP");
    expect(result.period).toBe("year");
  });

  it("leaves a posting with no stated salary unknown rather than estimating one", () => {
    const result = toAshbyCompensation(undefined, "2026-07-21T12:00:00.000Z");
    expect(result.provenance).toBe("unknown");
    expect(result.minimum).toBeNull();
    expect(result.maximum).toBeNull();
    expect(result.raw).toBeNull();
  });

  it("keeps unparseable salary text advertised with no invented figure", () => {
    const result = toAshbyCompensation(
      { compensationTierSummary: "Competitive, depending on experience" },
      "2026-07-21T12:00:00.000Z",
    );
    expect(result.provenance).toBe("advertised");
    expect(result.raw).toBe("Competitive, depending on experience");
    expect(result.minimum).toBeNull();
    expect(result.maximum).toBeNull();
  });

  it("prefers the tier summary and falls back to the scrapeable one", () => {
    expect(
      toAshbyCompensation(
        {
          compensationTierSummary: "£70,000 per year",
          scrapeableCompensationSalarySummary: "£1 per year",
        },
        "2026-07-21T12:00:00.000Z",
      ).raw,
    ).toBe("£70,000 per year");

    expect(
      toAshbyCompensation(
        { scrapeableCompensationSalarySummary: "£70,000 per year" },
        "2026-07-21T12:00:00.000Z",
      ).raw,
    ).toBe("£70,000 per year");
  });

  // Acceptance: duplicate control across providers, reconciled through the
  // canonical occurrence key without losing either provider's provenance.
  it("reconciles a listing that also appears on another provider's board", async () => {
    const employerApplyUrl =
      "https://careers.fictional-uk-employer.test/apply/platform-engineer";

    const { instance } = adapter({
      jobs: [
        posting({
          applyUrl: `${employerApplyUrl}?utm_source=ashby&utm_campaign=board`,
        }),
      ],
    });
    const ashbyResult = await instance.fetchJobs(source);
    const fromAshby = await normaliseProviderJob(source, ashbyResult.jobs[0]!);

    const greenhouseSource: JobSource = {
      id: "3b2c4d5e-6f70-8192-a3b4-c5d6e7f80912",
      provider: "greenhouse",
      boardToken: "fictional-uk-employer",
      employerName: "Fictional UK Employer Ltd",
      allowedHosts: ["boards.greenhouse.io"],
    };
    const fromGreenhouse = await normaliseProviderJob(greenhouseSource, {
      providerJobId: "greenhouse-9999",
      title: "Platform Engineer",
      location: "Manchester",
      descriptionHtml: "<p>Work on our UK platform in Manchester.</p>",
      absoluteUrl: "https://boards.greenhouse.io/fictional-uk-employer/9999",
      canonicalApplicationUrl: `${employerApplyUrl}?utm_source=greenhouse`,
      updatedAt: null,
      metadataText: [],
    });

    expect(fromAshby.outcome).toBe("eligible");
    expect(fromGreenhouse.outcome).toBe("eligible");
    if (fromAshby.outcome !== "eligible") return;
    if (fromGreenhouse.outcome !== "eligible") return;

    // The same employer destination on two boards reconciles to one occurrence
    // once tracking parameters are removed.
    expect(fromAshby.job.deduplicationKey).toBe(
      fromGreenhouse.job.deduplicationKey,
    );
    // And neither loses its own provenance.
    expect(fromAshby.job.sourceId).toBe(source.id);
    expect(fromGreenhouse.job.sourceId).toBe(greenhouseSource.id);
  });

  it("rejects a response whose shape does not match, without leaking it", async () => {
    const { instance } = adapter({ jobs: [{ id: 7 }] });
    await expect(instance.fetchJobs(source)).rejects.toThrow(
      /did not match the expected schema/,
    );
  });

  it("rejects invalid JSON syntax", async () => {
    const { instance } = adapter("{not json");
    await expect(instance.fetchJobs(source)).rejects.toThrow(
      /invalid JSON syntax/,
    );
  });

  it("raises a bounded http error rather than retrying a client fault", async () => {
    let calls = 0;
    const instance = new AshbyAdapter({
      fetch: (async () => {
        calls += 1;
        return new Response("", { status: 404 });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    await expect(instance.fetchJobs(source)).rejects.toThrow(/HTTP status 404/);
    expect(calls).toBe(1);
  });

  it("retries a transient status within the attempt bound", async () => {
    let calls = 0;
    const instance = new AshbyAdapter({
      fetch: (async () => {
        calls += 1;
        if (calls < 3) return new Response("", { status: 503 });
        return new Response(JSON.stringify({ jobs: [posting()] }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
      sleep: async () => {},
      random: () => 0,
    });
    const result = await instance.fetchJobs(source);
    expect(calls).toBe(3);
    expect(result.jobs).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import {
  AdapterError,
  WorkableAdapter,
  type JobSource,
  classifyWorkableEmploymentType,
  classifyWorkableWorkingTime,
  normaliseProviderJob,
  toWorkableLocation,
} from "./index";

const source: JobSource = {
  id: "4d3c2b1a-9f8e-4d6c-8b4a-3f2e1d0c9b8a",
  provider: "workable",
  boardToken: "fictional-uk-employer",
  employerName: "Fictional UK Employer Ltd",
  allowedHosts: ["apply.workable.com"],
};

/**
 * Entirely fictional. No real employer, posting, or person appears here, and no
 * request in this file leaves the process. The *shape* mirrors what a live
 * board returned on 2026-07-21; the content does not.
 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    title: "Fleet Systems Analyst",
    shortcode: "AAAA1111BB",
    employment_type: "Full-time",
    telecommuting: false,
    department: "Technology",
    url: "https://apply.workable.com/j/AAAA1111BB",
    application_url: "https://apply.workable.com/j/AAAA1111BB/apply",
    published_on: "2026-07-10",
    city: "Leicester",
    state: "England",
    function: "Engineering",
    industry: "Logistics",
    locations: [{ city: "Leicester", region: "England", hidden: false }],
    description: "<p>Work on our UK fleet compliance platform.</p>",
    ...overrides,
  };
}

function adapter(body: unknown, status = 200) {
  const requested: URL[] = [];
  const instance = new WorkableAdapter({
    fetch: (async (input: URL) => {
      requested.push(input);
      return new Response(
        typeof body === "string" ? body : JSON.stringify(body),
        { status, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch,
    sleep: async () => {},
  });
  return { instance, requested };
}

describe("Workable adapter", () => {
  it("refuses a source that is not a Workable source", async () => {
    const { instance } = adapter({ jobs: [] });
    await expect(
      instance.fetchJobs({ ...source, provider: "lever" } as JobSource),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it("reports complete coverage, because one request returns the whole board", async () => {
    const { instance } = adapter({ jobs: [row()] });
    expect((await instance.fetchJobs(source)).coverage).toBe("complete");
  });

  it("requests descriptions explicitly, which is where UK evidence lives", async () => {
    const { instance, requested } = adapter({ jobs: [row()] });
    await instance.fetchJobs(source);
    expect(requested[0]?.searchParams.get("details")).toBe("true");
  });

  // The defining shape of this source, found by probing a live board: one
  // advert spanning five cities came back as five rows sharing one shortcode
  // and one application_url.
  describe("a multi-location advert served as one row per location", () => {
    const cities = [
      "Leicester",
      "Coventry",
      "London",
      "Northampton",
      "Royal Tunbridge Wells",
    ];
    const spread = cities.map((city) =>
      row({
        city,
        locations: [{ city, region: "England", hidden: false }],
      }),
    );

    it("becomes one job, not one per location", async () => {
      const { instance } = adapter({ jobs: spread });
      const result = await instance.fetchJobs(source);
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0]!.providerJobId).toBe("AAAA1111BB");
    });

    it("gathers every location into the evidence", async () => {
      const { instance } = adapter({ jobs: spread });
      const result = await instance.fetchJobs(source);
      for (const city of cities) {
        expect(result.jobs[0]!.location).toContain(city);
      }
    });

    // Without grouping these would share one canonical deduplication key and
    // overwrite one another non-deterministically.
    it("does not emit rows that would collide on the deduplication key", async () => {
      const { instance } = adapter({ jobs: spread });
      const result = await instance.fetchJobs(source);
      const keys = await Promise.all(
        result.jobs.map(async (job) => {
          const normalised = await normaliseProviderJob(source, job);
          return normalised.outcome === "eligible"
            ? normalised.job.deduplicationKey
            : null;
        }),
      );
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("still separates two genuinely different adverts", async () => {
      const { instance } = adapter({
        jobs: [...spread, row({ shortcode: "CCCC2222DD", title: "Driver" })],
      });
      const result = await instance.fetchJobs(source);
      expect(result.jobs).toHaveLength(2);
    });
  });

  it("publishes an all-UK multi-location advert", async () => {
    const { instance } = adapter({
      jobs: ["Leicester", "Coventry"].map((city) =>
        row({ city, locations: [{ city, region: "England", hidden: false }] }),
      ),
    });
    const result = await instance.fetchJobs(source);
    const normalised = await normaliseProviderJob(source, result.jobs[0]!);
    expect(normalised.outcome).toBe("eligible");
  });

  // The classifier requires every label to be recognised, so a mixed advert
  // quarantines rather than publishing on the strength of its UK half.
  it("does not publish an advert spanning the UK and abroad", async () => {
    const { instance } = adapter({
      jobs: [
        row({
          city: "London",
          locations: [{ city: "London", region: "England" }],
        }),
        row({
          city: "Paris",
          locations: [{ city: "Paris", region: "Ile-de-France" }],
        }),
      ],
    });
    const result = await instance.fetchJobs(source);
    const normalised = await normaliseProviderJob(source, result.jobs[0]!);
    expect(normalised.outcome).not.toBe("eligible");
  });

  it("drops a hidden location rather than publishing on it", () => {
    expect(
      toWorkableLocation([
        row({
          locations: [
            { city: "Leicester", region: "England", hidden: false },
            { city: "Paris", region: "Ile-de-France", hidden: true },
          ],
        }) as never,
      ]),
    ).toBe("Leicester, England");
  });

  it("falls back to the top-level city and state when no location is nested", () => {
    expect(
      toWorkableLocation([
        row({ city: "Bristol", state: "England", locations: [] }) as never,
      ]),
    ).toBe("Bristol, England");
  });

  it("collapses a repeated city rather than repeating the label", () => {
    expect(
      toWorkableLocation([
        row({ locations: [{ city: "Leeds", region: "England" }] }) as never,
        row({ locations: [{ city: "Leeds", region: "England" }] }) as never,
      ]),
    ).toBe("Leeds, England");
  });

  // `telecommuting` is a bare boolean with no country attached, so it carries
  // no explicit UK permission and must never publish a role on its own.
  it("does not publish a remote advert on the telecommuting flag alone", async () => {
    const { instance } = adapter({
      jobs: [
        row({
          telecommuting: true,
          city: null,
          state: null,
          locations: [],
          description: "<p>A fully remote engineering role.</p>",
        }),
      ],
    });
    const result = await instance.fetchJobs(source);
    const normalised = await normaliseProviderJob(source, result.jobs[0]!);
    expect(normalised.outcome).not.toBe("eligible");
  });

  it("does not read a working-time token as a contract type", () => {
    expect(classifyWorkableEmploymentType("Full-time")).toBe("unknown");
    expect(classifyWorkableWorkingTime("Full-time")).toBe("full_time");
    expect(classifyWorkableEmploymentType("Part-time")).toBe("unknown");
    expect(classifyWorkableWorkingTime("Part-time")).toBe("part_time");
  });

  it("reads a contract token as a contract type and states no working time", () => {
    expect(classifyWorkableEmploymentType("Contract")).toBe("contract");
    expect(classifyWorkableWorkingTime("Contract")).toBe("unknown");
    expect(classifyWorkableEmploymentType("Internship")).toBe("internship");
  });

  // Workable publishes no compensation field at all. This is a property of the
  // provider, so it is pinned rather than left implicit.
  it("always reports unknown compensation, and never invents a figure", async () => {
    const { instance } = adapter({ jobs: [row()] });
    const result = await instance.fetchJobs(source);
    expect(result.jobs[0]!.compensation).toMatchObject({
      provenance: "unknown",
      raw: null,
      minimum: null,
      maximum: null,
      currency: null,
    });
  });

  it("rejects a response whose shape does not match, without leaking it", async () => {
    const { instance } = adapter({ jobs: [{ title: 7 }] });
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
    const instance = new WorkableAdapter({
      fetch: (async () => {
        calls += 1;
        return new Response("", { status: 404 });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    await expect(instance.fetchJobs(source)).rejects.toThrow(/HTTP status 404/);
    expect(calls).toBe(1);
  });

  // Workable documents 10 requests per 10 seconds and answers 429 on exceed.
  // One request per run sits far below that, so a 429 is treated as transient
  // and retried under the shared bounded backoff.
  it("retries a rate-limit response within the attempt bound", async () => {
    let calls = 0;
    const instance = new WorkableAdapter({
      fetch: (async () => {
        calls += 1;
        if (calls < 3) return new Response("", { status: 429 });
        return new Response(JSON.stringify({ jobs: [row()] }), { status: 200 });
      }) as unknown as typeof fetch,
      sleep: async () => {},
      random: () => 0,
    });
    const result = await instance.fetchJobs(source);
    expect(calls).toBe(3);
    expect(result.jobs).toHaveLength(1);
  });
});

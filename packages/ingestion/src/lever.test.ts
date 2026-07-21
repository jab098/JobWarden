import { describe, expect, it } from "vitest";

import {
  AdapterError,
  LeverAdapter,
  type LeverAdapterOptions,
  type JobSource,
  classifyCommitment,
  classifyLeverWorkingTime,
  classifySalaryInterval,
  normaliseProviderJob,
  toCompensation,
} from "./index";

const source: JobSource = {
  id: "1f0a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8",
  provider: "lever",
  boardToken: "fictional-uk-employer",
  employerName: "Fictional UK Employer Ltd",
  allowedHosts: ["jobs.lever.co"],
};

/**
 * Entirely fictional. No real employer, posting, or person appears here, and no
 * request in this file leaves the process.
 */
function posting(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb",
    text: "Data Engineer",
    hostedUrl: "https://jobs.lever.co/fictional-uk-employer/aaaaaaaa",
    applyUrl: "https://jobs.lever.co/fictional-uk-employer/aaaaaaaa/apply",
    createdAt: 1_760_000_000_000,
    categories: {
      location: "Manchester",
      commitment: "Full-time",
      team: "Data",
      department: "Engineering",
    },
    description: "<p>Work on our UK data platform in Manchester.</p>",
    lists: [{ text: "Requirements", content: "<li>SQL</li>" }],
    additional: "<p>We are an equal opportunities employer.</p>",
    ...overrides,
  };
}

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function adapterWith(
  fetchImplementation: typeof fetch,
  overrides: Partial<LeverAdapterOptions> = {},
): LeverAdapter {
  return new LeverAdapter({
    fetch: fetchImplementation,
    sleep: async () => undefined,
    random: () => 0,
    createTimeoutSignal: () => new AbortController().signal,
    ...overrides,
  });
}

async function fetchOne(body: unknown) {
  const adapter = adapterWith(async () => response(body));
  const result = await adapter.fetchJobs(source);
  const [job] = result.jobs;
  if (job === undefined) throw new Error("fixture produced no job");
  return { result, job };
}

describe("Lever read-only adapter", () => {
  it("reads the documented public postings endpoint and reports complete coverage", async () => {
    const requests: string[] = [];
    const adapter = adapterWith(async (input) => {
      requests.push(String(input));
      return response([posting()]);
    });

    const result = await adapter.fetchJobs(source);

    expect(requests).toEqual([
      "https://api.lever.co/v0/postings/fictional-uk-employer?mode=json",
    ]);
    expect(result.coverage).toBe("complete");
    expect(result.jobs).toHaveLength(1);
  });

  it("refuses a source belonging to another provider", async () => {
    const adapter = adapterWith(async () => response([]));

    await expect(
      adapter.fetchJobs({ ...source, provider: "greenhouse" }),
    ).rejects.toMatchObject({ code: "configuration_error" });
  });

  it("rejects a malformed payload before any job is trusted", async () => {
    const adapter = adapterWith(async () =>
      response([{ id: "only-an-id-and-nothing-else" }]),
    );

    await expect(adapter.fetchJobs(source)).rejects.toBeInstanceOf(
      AdapterError,
    );
    await expect(adapter.fetchJobs(source)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects invalid JSON syntax rather than guessing at it", async () => {
    const adapter = adapterWith(
      async () =>
        new Response("{not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await expect(adapter.fetchJobs(source)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("retries a transient status within the bounded policy", async () => {
    let calls = 0;
    const adapter = adapterWith(async () => {
      calls += 1;
      if (calls < 3) return response([], { status: 503 });
      return response([posting()]);
    });

    const result = await adapter.fetchJobs(source);

    expect(calls).toBe(3);
    expect(result.jobs).toHaveLength(1);
  });

  it("does not retry a client error", async () => {
    let calls = 0;
    const adapter = adapterWith(async () => {
      calls += 1;
      return response([], { status: 404 });
    });

    await expect(adapter.fetchJobs(source)).rejects.toMatchObject({
      code: "http_error",
      status: 404,
    });
    expect(calls).toBe(1);
  });

  it("joins the opening, lists, and closing so eligibility text is not lost", async () => {
    const { job } = await fetchOne([posting()]);

    expect(job.descriptionHtml).toContain("UK data platform");
    expect(job.descriptionHtml).toContain("Requirements");
    expect(job.descriptionHtml).toContain("equal opportunities");
  });
});

describe("Lever commitment classification", () => {
  it.each([
    // "Full-time" states working time, not contract type. This asserted
    // "permanent" until an independent review found Lever was the one adapter
    // asserting a contract the advert never stated.
    ["Full-time", "unknown"],
    ["Part-time", "unknown"],
    ["Contract", "contract"],
    ["Internship", "internship"],
    ["Apprenticeship", "apprenticeship"],
    ["Temporary", "temporary"],
    ["Fixed term", "fixed_term"],
    ["", "unknown"],
    ["Something Lever invented later", "unknown"],
  ])("reads %s as %s", (commitment, expected) => {
    expect(classifyCommitment(commitment)).toBe(expected);
  });

  // The working time is not discarded, it just stops masquerading as a
  // contract type.
  it.each([
    ["Full-time", "full_time"],
    ["Part-time", "part_time"],
    ["Contract", "unknown"],
    ["", "unknown"],
  ])("reads the working time of %s as %s", (commitment, expected) => {
    expect(classifyLeverWorkingTime(commitment)).toBe(expected);
  });

  it("never infers an IR35 status from a contract commitment", async () => {
    const { job } = await fetchOne([
      posting({
        categories: { location: "Manchester", commitment: "Contract" },
      }),
    ]);

    expect(job.employmentType).toBe("contract");
    // The provider job carries no IR35 field at all: a contract is not evidence
    // of a determination, and inferring one is forbidden outright.
    expect(job).not.toHaveProperty("ir35Status");
  });
});

describe("Lever compensation provenance", () => {
  it("treats an absent salary range as unknown, inventing no figure", () => {
    const compensation = toCompensation(undefined);

    expect(compensation).toMatchObject({
      provenance: "unknown",
      minimum: null,
      maximum: null,
      currency: null,
      raw: null,
    });
  });

  it("treats a stated GBP range as advertised and keeps both bounds", () => {
    const compensation = toCompensation({
      currency: "GBP",
      interval: "per-year-salary",
      min: 55_000,
      max: 65_000,
    });

    expect(compensation).toMatchObject({
      provenance: "advertised",
      minimum: 55_000,
      maximum: 65_000,
      currency: "GBP",
      period: "year",
    });
  });

  it("does not convert a non-GBP range into a GBP claim", () => {
    const compensation = toCompensation({
      currency: "USD",
      interval: "per-year-salary",
      min: 100_000,
      max: 120_000,
    });

    expect(compensation).toMatchObject({
      provenance: "unknown",
      currency: null,
      minimum: null,
      maximum: null,
    });
  });

  it("does not read an unrecognised interval as a yearly salary", () => {
    expect(classifySalaryInterval("per-fortnight-stipend")).toBe("unknown");
    expect(classifySalaryInterval("per-hour-wage")).toBe("hour");
    expect(classifySalaryInterval(null)).toBe("unknown");
  });
});

describe("Lever postings through the shared normaliser", () => {
  async function normaliseFirst(overrides: Record<string, unknown> = {}) {
    const { job } = await fetchOne([posting(overrides)]);
    return normaliseProviderJob(source, job);
  }

  it("publishes a posting whose location is a recognised UK place", async () => {
    const result = await normaliseFirst();

    expect(result.outcome).toBe("eligible");
  });

  it("quarantines an unrecognised location rather than publishing it", async () => {
    const result = await normaliseFirst({
      categories: { location: "Springfield, Shelbyville", commitment: null },
      description: "<p>A role at our office.</p>",
    });

    expect(result).toMatchObject({
      outcome: "quarantined",
      reason: "ambiguous_uk_eligibility",
    });
  });

  // These two are a pair and are only meaningful together. The negative alone
  // would pass even if remote handling were entirely broken, because "Remote"
  // is not a UK place name and would fail location recognition anyway. The
  // positive is what proves the permission is actually being read.
  it("does not publish a remote posting without explicit UK permission", async () => {
    const result = await normaliseFirst({
      categories: { location: "Remote", commitment: "Full-time" },
      description: "<p>Fully remote role, work from anywhere.</p>",
      lists: null,
      additional: null,
    });

    expect(result.outcome).not.toBe("eligible");
  });

  it("publishes a remote posting that states UK permission outright", async () => {
    const result = await normaliseFirst({
      categories: { location: "Remote", commitment: "Full-time" },
      description:
        "<p>Fully remote. Applicants must be based in the United Kingdom and hold the right to work in the UK.</p>",
      lists: null,
      additional: null,
    });

    expect(result.outcome).toBe("eligible");
  });

  // The gate reads `absoluteUrl`, which is Lever's `hostedUrl`, so that is what
  // this moves off the allowlist.
  it("quarantines a posting link outside the allowlisted hosts", async () => {
    const result = await normaliseFirst({
      hostedUrl: "https://not-the-allowlisted-host.example/posting",
    });

    expect(result).toMatchObject({
      outcome: "quarantined",
      reason: "invalid_application_url",
    });
  });

  it("refuses a plain-HTTP posting link even on an allowlisted host", async () => {
    const result = await normaliseFirst({
      hostedUrl: "http://jobs.lever.co/fictional-uk-employer/aaaaaaaa",
    });

    expect(result).toMatchObject({
      outcome: "quarantined",
      reason: "invalid_application_url",
    });
  });
});

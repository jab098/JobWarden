import { describe, expect, it } from "vitest";

import {
  AdapterError,
  ReedAdapter,
  type JobSource,
  type ReedAdapterOptions,
} from "./index";

const source: JobSource = {
  id: "b8db5c79-c659-410b-a229-aa3bac502ca6",
  provider: "reed",
  boardToken: "gb-discovery",
  employerName: "Reed",
  allowedHosts: ["www.reed.co.uk"],
};

const details = {
  jobId: 123,
  employerName: "Example Consulting Ltd",
  jobTitle: "Implementation Consultant",
  locationName: "London",
  jobDescription: "Contract role based in London. Outside IR35.",
  jobUrl: "https://www.reed.co.uk/jobs/implementation-consultant/123",
  externalUrl: "https://jobs.example.com/123?utm_source=reed",
  date: "2026-07-18T08:00:00Z",
  expirationDate: "2026-08-18T08:00:00Z",
  minimumSalary: 450,
  maximumSalary: 550,
  currency: "GBP",
  salaryType: "Per Annum",
  contractType: "Contract",
  jobType: "PartTime",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function adapterWith(
  fetchImplementation: typeof fetch,
  overrides: Partial<ReedAdapterOptions> = {},
): ReedAdapter {
  return new ReedAdapter({
    apiKey: "test-api-key",
    fetch: fetchImplementation,
    sleep: async () => undefined,
    random: () => 0,
    createTimeoutSignal: () => new AbortController().signal,
    now: () => Date.parse("2026-07-18T09:00:00.000Z"),
    ...overrides,
  });
}

describe("Reed Jobseeker API adapter", () => {
  it("fetches one bounded documented UK page and maps provider salary phrases", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      return url.pathname.endsWith("/search")
        ? json({ results: [{ jobId: 123 }] })
        : json(details);
    };

    const result = await adapterWith(fetchImplementation).fetchJobs(source);

    expect(result.coverage).toBe("incremental");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.origin + requests[0]?.url.pathname).toBe(
      "https://www.reed.co.uk/api/1.0/search",
    );
    expect(requests[0]?.url.searchParams.get("resultsToTake")).toBe("50");
    expect(requests[0]?.url.searchParams.get("resultsToSkip")).toBe("0");
    expect(requests[0]?.url.searchParams.has("sortBy")).toBe(false);
    expect(requests[1]?.url.pathname).toBe("/api/1.0/jobs/123");
    for (const request of requests) {
      const headers = new Headers(request.init?.headers);
      expect(headers.get("authorization")).toBe(
        `Basic ${btoa("test-api-key:")}`,
      );
      expect(headers.get("accept")).toBe("application/json");
    }
    expect(result.jobs).toEqual([
      {
        providerJobId: "123",
        title: "Implementation Consultant",
        employerName: "Example Consulting Ltd",
        location: "London",
        descriptionHtml: "Contract role based in London. Outside IR35.",
        absoluteUrl:
          "https://www.reed.co.uk/jobs/implementation-consultant/123",
        canonicalApplicationUrl: "https://jobs.example.com/123?utm_source=reed",
        updatedAt: null,
        postedAt: "2026-07-18T08:00:00.000Z",
        closesAt: "2026-08-18T08:00:00.000Z",
        metadataText: ["Contract type: Contract", "Job type: PartTime"],
        employmentType: "contract",
        workingTime: "part_time",
        compensation: {
          raw: "GBP 450 - 550 per year",
          minimum: 450,
          maximum: 550,
          currency: "GBP",
          period: "year",
          provenance: "advertised",
          observedAt: "2026-07-18T09:00:00.000Z",
        },
      },
    ]);
  });

  it("never exceeds four concurrent detail calls", async () => {
    let active = 0;
    let maximum = 0;
    const fetchImplementation: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return json({
          results: Array.from({ length: 8 }, (_, index) => ({
            jobId: index + 1,
          })),
        });
      }

      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const jobId = Number(url.pathname.split("/").at(-1));
      return json({ ...details, jobId });
    };

    await adapterWith(fetchImplementation).fetchJobs(source);

    expect(maximum).toBe(4);
  });

  it("caps discovery at fifty detail requests even if the provider over-returns", async () => {
    let detailRequests = 0;
    const fetchImplementation: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return json({
          results: Array.from({ length: 75 }, (_, index) => ({
            jobId: index + 1,
          })),
        });
      }
      detailRequests += 1;
      return json({ ...details, jobId: detailRequests });
    };

    const result = await adapterWith(fetchImplementation).fetchJobs(source);

    expect(result.jobs).toHaveLength(50);
    expect(detailRequests).toBe(50);
  });

  it("retries bounded transient server failures but rejects malformed details", async () => {
    let searchAttempts = 0;
    const fetchImplementation: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        searchAttempts += 1;
        return searchAttempts === 1
          ? new Response("private failure", { status: 503 })
          : json({ results: [{ jobId: 123 }] });
      }
      return json({ ...details, jobDescription: { untrusted: true } });
    };

    await expect(
      adapterWith(fetchImplementation).fetchJobs(source),
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(searchAttempts).toBe(2);
  });

  it("honours a caller abort before making a provider request", async () => {
    let requests = 0;
    const caller = AbortSignal.abort(new Error("private caller reason"));
    const error = await adapterWith(async () => {
      requests += 1;
      return json({ results: [] });
    })
      .fetchJobs(source, caller)
      .catch((caught: unknown) => caught);

    expect(requests).toBe(0);
    expect(error).toMatchObject({ code: "aborted", attempts: 0 });
    expect(JSON.stringify(error)).not.toContain("private caller reason");
  });

  it("fails immediately on rate limiting without exposing the API key or body", async () => {
    const privateBody = "private provider response";
    let attempts = 0;
    const error = await adapterWith(async () => {
      attempts += 1;
      return new Response(privateBody, { status: 429 });
    })
      .fetchJobs(source)
      .catch((caught: unknown) => caught);

    expect(attempts).toBe(1);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error).toMatchObject({
      code: "http_error",
      status: 429,
      attempts: 1,
    });
    expect(JSON.stringify(error)).not.toContain("test-api-key");
    expect(JSON.stringify(error)).not.toContain(privateBody);
  });

  it("refuses to start without an API key", async () => {
    await expect(
      new ReedAdapter({ apiKey: "" }).fetchJobs(source),
    ).rejects.toMatchObject({
      code: "configuration_error",
      attempts: 0,
    });
  });
});

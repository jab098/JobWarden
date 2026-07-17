import { describe, expect, it } from "vitest";

import mixedFixture from "./fixtures/greenhouse-mixed.json";
import {
  AdapterError,
  GreenhouseAdapter,
  type GreenhouseAdapterOptions,
  type JobSource,
} from "./index";

const source: JobSource = {
  id: "5f32d2ad-a91d-467b-a491-1e2193e69d18",
  provider: "greenhouse",
  boardToken: "acme/example",
  employerName: "Acme Ltd",
  allowedHosts: ["boards.greenhouse.io"],
};

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function adapterWith(
  fetchImplementation: typeof fetch,
  overrides: Partial<GreenhouseAdapterOptions> = {},
): GreenhouseAdapter {
  return new GreenhouseAdapter({
    fetch: fetchImplementation,
    sleep: async () => undefined,
    random: () => 0,
    createTimeoutSignal: () => new AbortController().signal,
    ...overrides,
  });
}

describe("Greenhouse read-only adapter", () => {
  it("maps a completely validated fixture through the documented GET endpoint", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return response(mixedFixture);
    };

    const jobs = await adapterWith(fetchImplementation).fetchJobs(source);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://boards-api.greenhouse.io/v1/boards/acme%2Fexample/jobs?content=true",
    );
    expect(requests[0]?.init).toMatchObject({
      method: "GET",
      redirect: "error",
    });
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("user-agent")).toBe(
      "JobWarden/0.1 (+private UK job index)",
    );
    expect(headers.has("authorization")).toBe(false);
    expect(jobs).toHaveLength(5);
    expect(jobs[0]).toEqual({
      providerJobId: "1001",
      title: "Platform Engineer",
      location: "London, England",
      descriptionHtml:
        "<p>Permanent full-time hybrid role.</p><p>Build reliable platforms for our customers.</p>",
      absoluteUrl: "https://boards.greenhouse.io/acme/jobs/1001",
      updatedAt: "2026-07-16T09:30:00Z",
      metadataText: ["Employment Type: Permanent", "Salary: £60,000 per year"],
    });
    expect(jobs[4]?.metadataText).toEqual([
      "Internal note: null",
      "Openings: 2",
      "Travel required: false",
    ]);
  });

  it("rejects the entire response before mapping when any job is invalid", async () => {
    const privatePayload = "PRIVATE_RESPONSE_BODY";
    const invalid = {
      jobs: [
        mixedFixture.jobs[0],
        { ...mixedFixture.jobs[1], content: { privatePayload } },
      ],
    };

    const error = await adapterWith(async () => response(invalid))
      .fetchJobs(source)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdapterError);
    expect(error).toMatchObject({ code: "invalid_response", attempts: 1 });
    expect(JSON.stringify(error)).not.toContain(privatePayload);
    expect((error as Error).message).not.toContain(privatePayload);
  });

  it("rejects unvalidated metadata value shapes", async () => {
    const invalid = {
      jobs: [
        {
          ...mixedFixture.jobs[0],
          metadata: [{ name: "Secret", value: { nested: "not allowed" } }],
        },
      ],
    };

    await expect(
      adapterWith(async () => response(invalid)).fetchJobs(source),
    ).rejects.toMatchObject({ code: "invalid_response", attempts: 1 });
  });

  it("retries transient responses at most twice", async () => {
    let attempts = 0;
    const statuses = [408, 503, 200];
    const fetchImplementation: typeof fetch = async () => {
      const status = statuses[attempts++] ?? 500;
      return status === 200
        ? response({ jobs: [] })
        : new Response("do not inspect", { status });
    };

    await expect(
      adapterWith(fetchImplementation).fetchJobs(source),
    ).resolves.toEqual([]);
    expect(attempts).toBe(3);
  });

  it("caps Retry-After seconds before using the injected sleep", async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const fetchImplementation: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("rate limited private body", {
          status: 429,
          headers: { "retry-after": "999999999999999999999999" },
        });
      }
      return response({ jobs: [] });
    };

    await adapterWith(fetchImplementation, {
      maxRetryAfterMs: 2_000,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    }).fetchJobs(source);

    expect(sleeps).toEqual([2_000]);
  });

  it("does not retry a non-transient 403 or expose its body", async () => {
    let attempts = 0;
    const privateBody = "AUTHORIZATION=private-value";
    const error = await adapterWith(async () => {
      attempts += 1;
      return new Response(privateBody, { status: 403 });
    })
      .fetchJobs(source)
      .catch((caught: unknown) => caught);

    expect(attempts).toBe(1);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error).toMatchObject({
      code: "http_error",
      status: 403,
      attempts: 1,
    });
    expect(JSON.stringify(error)).not.toContain(privateBody);
    expect((error as Error).message).not.toContain(privateBody);
  });

  it("does not broaden the transient policy beyond 5xx statuses", async () => {
    let attempts = 0;
    const nonStandardResponse = {
      ok: false,
      status: 600,
      headers: new Headers(),
    } as Response;

    const error = await adapterWith(async () => {
      attempts += 1;
      return nonStandardResponse;
    })
      .fetchJobs(source)
      .catch((caught: unknown) => caught);

    expect(attempts).toBe(1);
    expect(error).toMatchObject({
      code: "http_error",
      status: 600,
      attempts: 1,
    });
  });

  it("retries internal timeouts with an injected eight-second timeout", async () => {
    const timeoutDurations: number[] = [];
    let attempts = 0;
    const fetchImplementation: typeof fetch = async (_input, init) => {
      attempts += 1;
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("private timeout details", "AbortError");
    };

    const error = await adapterWith(fetchImplementation, {
      createTimeoutSignal: (milliseconds) => {
        timeoutDurations.push(milliseconds);
        return AbortSignal.abort(new DOMException("Timeout", "TimeoutError"));
      },
    })
      .fetchJobs(source)
      .catch((caught: unknown) => caught);

    expect(attempts).toBe(3);
    expect(timeoutDurations).toEqual([8_000, 8_000, 8_000]);
    expect(error).toMatchObject({ code: "timeout", attempts: 3 });
    expect((error as Error).message).not.toContain("private timeout details");
  });

  it("stops immediately without retrying when the caller has aborted", async () => {
    const caller = new AbortController();
    caller.abort(new Error("private caller reason"));
    let attempts = 0;

    const error = await adapterWith(async () => {
      attempts += 1;
      return response({ jobs: [] });
    })
      .fetchJobs(source, caller.signal)
      .catch((caught: unknown) => caught);

    expect(attempts).toBe(0);
    expect(error).toMatchObject({ code: "aborted", attempts: 0 });
    expect((error as Error).message).not.toContain("private caller reason");
  });

  it("retries network failures without retaining third-party error details", async () => {
    let attempts = 0;
    const error = await adapterWith(async () => {
      attempts += 1;
      throw new TypeError("https://token:secret@example.test/private");
    })
      .fetchJobs(source)
      .catch((caught: unknown) => caught);

    expect(attempts).toBe(3);
    expect(error).toMatchObject({ code: "network_error", attempts: 3 });
    expect(JSON.stringify(error)).not.toContain("token:secret");
  });
});

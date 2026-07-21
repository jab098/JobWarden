import { describe, expect, it } from "vitest";

import {
  AshbyAdapter,
  GreenhouseAdapter,
  LeverAdapter,
  TeachingVacanciesAdapter,
  WorkableAdapter,
  type JobSource,
  type ProviderAdapter,
} from "./index";

/**
 * The shared transport's per-provider identity.
 *
 * Every adapter but Reed now raises its errors from one loop in
 * `transport.ts`, which templates the provider name into each message. Nothing
 * else in the suite pins that name: before this file existed, a transport that
 * reported "Greenhouse" for all four adapters passed all 136 ingestion tests.
 * That is the failure this file exists to catch — an operator reading an audit
 * record needs the error to name the source that actually failed.
 *
 * Reed is deliberately absent. It keeps its own loop because it must not retry
 * HTTP 429; `reed.ts` records why.
 */

type Case = {
  readonly name: string;
  readonly adapter: (fetchImpl: typeof fetch) => ProviderAdapter;
  readonly source: JobSource;
};

const base = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  employerName: "Fictional UK Employer Ltd",
};

const cases: Case[] = [
  {
    name: "Greenhouse",
    adapter: (fetchImpl) =>
      new GreenhouseAdapter({ fetch: fetchImpl, sleep: async () => {} }),
    source: {
      ...base,
      provider: "greenhouse",
      boardToken: "fictional",
      allowedHosts: ["boards.greenhouse.io"],
    },
  },
  {
    name: "Lever",
    adapter: (fetchImpl) =>
      new LeverAdapter({ fetch: fetchImpl, sleep: async () => {} }),
    source: {
      ...base,
      provider: "lever",
      boardToken: "fictional",
      allowedHosts: ["jobs.lever.co"],
    },
  },
  {
    name: "Ashby",
    adapter: (fetchImpl) =>
      new AshbyAdapter({ fetch: fetchImpl, sleep: async () => {} }),
    source: {
      ...base,
      provider: "ashby",
      boardToken: "fictional",
      allowedHosts: ["jobs.ashbyhq.com"],
    },
  },
  {
    name: "Teaching Vacancies",
    adapter: (fetchImpl) =>
      new TeachingVacanciesAdapter({
        fetch: fetchImpl,
        sleep: async () => {},
      }),
    source: {
      ...base,
      provider: "teaching_vacancies",
      boardToken: "gb-discovery",
      allowedHosts: ["teaching-vacancies.service.gov.uk"],
    },
  },
  // Added by independent review. Task 32 put a fifth adapter on the shared
  // transport and did not add it here, so pointing Workable's transport at
  // "Greenhouse" passed the entire suite — the exact failure this file exists
  // to catch. Every adapter added to the transport belongs in this list.
  {
    name: "Workable",
    adapter: (fetchImpl) =>
      new WorkableAdapter({ fetch: fetchImpl, sleep: async () => {} }),
    source: {
      ...base,
      provider: "workable",
      boardToken: "fictional",
      allowedHosts: ["apply.workable.com"],
    },
  },
];

function respondWith(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

async function failureFrom(
  testCase: Case,
  fetchImpl: typeof fetch,
): Promise<Error> {
  const caught = await testCase
    .adapter(fetchImpl)
    .fetchJobs(testCase.source)
    .then(() => null)
    .catch((error: unknown) => error);

  expect(caught).toBeInstanceOf(Error);
  return caught as Error;
}

describe("shared bounded transport", () => {
  it.each(cases)("$name names itself in an HTTP failure", async (testCase) => {
    const error = await failureFrom(testCase, respondWith("", 404));
    expect(error.message).toContain(testCase.name);
    expect(error.message).toContain("404");
  });

  it.each(cases)(
    "$name names itself when the response is not valid JSON",
    async (testCase) => {
      const error = await failureFrom(testCase, respondWith("{not json"));
      expect(error.message).toContain(testCase.name);
      expect(error.message).toContain("invalid JSON syntax");
    },
  );

  it.each(cases)(
    "$name names itself when the response shape is wrong",
    async (testCase) => {
      const error = await failureFrom(
        testCase,
        respondWith(JSON.stringify({ unexpected: true })),
      );
      expect(error.message).toContain(testCase.name);
      expect(error.message).toContain("did not match the expected schema");
    },
  );

  // Sanitised errors are a standing requirement, not a nicety: a provider body
  // can carry anything, and these messages reach audit records.
  it.each(cases)("$name never leaks the response body", async (testCase) => {
    const secret = "PROVIDER-BODY-fictional-secret-do-not-leak";
    const error = await failureFrom(
      testCase,
      respondWith(JSON.stringify({ unexpected: secret })),
    );

    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(String(error.stack ?? "")).not.toContain(secret);
  });
});

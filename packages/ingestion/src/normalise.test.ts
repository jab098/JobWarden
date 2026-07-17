import { normalisedJobSchema } from "@jobwarden/domain";
import { describe, expect, it } from "vitest";

import mixedFixture from "./fixtures/greenhouse-mixed.json";
import ukFixture from "./fixtures/greenhouse-uk.json";
import {
  GreenhouseAdapter,
  type JobSource,
  type ProviderJob,
  htmlToPlainText,
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
    ["decoded", '<span title="role is based in UK">US Engineer</span>'],
    [
      "entity-encoded",
      "&lt;span title=&quot;role is based in UK&quot;&gt;US Engineer&lt;/span&gt;",
    ],
  ])(
    "does not classify invisible %s title attributes as UK evidence",
    async (_encoding, title) => {
      await expect(
        normaliseProviderJob(source, {
          ...baseJob,
          title,
          location: "Remote",
          descriptionHtml: "<p>Permanent engineering role.</p>",
        }),
      ).resolves.toEqual({
        outcome: "quarantined",
        reason: "ambiguous_uk_eligibility",
        providerJobId: baseJob.providerJobId,
      });
    },
  );

  it.each([
    ["decoded", '<span data-eligibility="London, England">Remote</span>'],
    [
      "entity-encoded",
      "&lt;span data-eligibility=&quot;London, England&quot;&gt;Remote&lt;/span&gt;",
    ],
  ])(
    "uses only the visible %s location and ignores hidden UK attributes",
    async (_encoding, location) => {
      await expect(
        normaliseProviderJob(source, {
          ...baseJob,
          title: "US Engineer",
          location,
          descriptionHtml: "<p>Permanent engineering role.</p>",
        }),
      ).resolves.toEqual({
        outcome: "quarantined",
        reason: "ambiguous_uk_eligibility",
        providerJobId: baseJob.providerJobId,
      });
    },
  );

  it("stores and classifies only visible title and location text", async () => {
    const job = await eligibleJob({
      ...baseJob,
      title:
        "&lt;span data-hidden=&quot;US applicants only&quot;&gt;Platform Engineer&lt;/span&gt;",
      location: '<span data-hidden="New York, NY">London, England</span>',
      descriptionHtml: "<p>Permanent full-time role.</p>",
    });

    expect(job.title).toBe("Platform Engineer");
    expect(job.ukEligibilityEvidence).toEqual(["Location: London, England"]);
    expect(JSON.stringify(job.ukEligibilityEvidence)).not.toMatch(
      /<[^>]*>|data-hidden|New York|US applicants/,
    );
  });

  it("decodes literal angle entities as ordinary plain-text comparisons", async () => {
    const job = await eligibleJob({
      ...baseJob,
      descriptionHtml:
        "<p>Permanent role where 5 &lt; 10 and 10 &gt; 5 &amp; quality matters.</p>",
    });

    expect(job.descriptionText).toBe(
      "Permanent role where 5 < 10 and 10 > 5 & quality matters.",
    );
  });

  it("re-sanitises double-encoded tag-shaped content instead of persisting it", async () => {
    const job = await eligibleJob({
      ...baseJob,
      descriptionHtml:
        "<p>Permanent role.</p>&amp;lt;img src=&amp;quot;https://evil.example/pixel&amp;quot; onerror=&amp;quot;steal()&amp;quot;&amp;gt;&amp;lt;script src=&amp;quot;https://evil.example/code.js&amp;quot;&amp;gt;STEAL()&amp;lt;/script&amp;gt;",
    });

    expect(job.descriptionText).toBe("Permanent role.");
    expect(job.descriptionText).not.toMatch(
      /&(?:amp;)?lt;|<[^>]*>|img|script|src=|onerror|evil\.example|STEAL/,
    );
  });

  it("prunes semantic non-rendered and embedded subtrees while retaining ordinary visible text", () => {
    const html = [
      "<head><title>HIDDEN_HEAD</title></head>",
      "<title>HIDDEN_TITLE</title>",
      "<iframe>HIDDEN_IFRAME</iframe>",
      "<object><span>HIDDEN_OBJECT</span></object>",
      '<embed title="HIDDEN_EMBED">',
      "<svg><text>HIDDEN_SVG</text></svg>",
      "<math><mtext>HIDDEN_MATH</mtext></math>",
      "<canvas>HIDDEN_CANVAS</canvas>",
      "<script>HIDDEN_SCRIPT</script>",
      "<style>HIDDEN_STYLE</style>",
      "<noscript>HIDDEN_NOSCRIPT</noscript>",
      "<template>HIDDEN_TEMPLATE</template>",
      "<textarea>HIDDEN_TEXTAREA</textarea>",
      "<select><option>HIDDEN_OPTION</option></select>",
      "<p>Visible <strong>ordinary</strong> text.</p>",
    ].join("");

    expect(htmlToPlainText(html)).toBe("Visible ordinary text.");
  });

  it("prunes explicitly hidden subtrees while retaining ordinary visible elements", () => {
    const html = [
      "<div hidden>HIDDEN_BOOLEAN</div>",
      '<div aria-hidden=" true ">HIDDEN_ARIA</div>',
      '<div style="display: none !important">HIDDEN_DISPLAY</div>',
      '<div style="visibility: hidden">HIDDEN_VISIBILITY</div>',
      "<section><span>Visible content</span></section>",
    ].join("");

    expect(htmlToPlainText(html)).toBe("Visible content");
  });

  it.each([
    ["decoded hidden", "<span hidden>role is based in UK</span> US Engineer"],
    [
      "entity-encoded aria-hidden",
      "&lt;span aria-hidden=&quot;true&quot;&gt;role is based in UK&lt;/span&gt; US Engineer",
    ],
  ])(
    "ignores %s title text when assessing UK eligibility",
    async (_case, title) => {
      await expect(
        normaliseProviderJob(source, {
          ...baseJob,
          title,
          location: "Remote",
          descriptionHtml: "<p>Visible engineering role.</p>",
        }),
      ).resolves.toEqual({
        outcome: "quarantined",
        reason: "ambiguous_uk_eligibility",
        providerJobId: baseJob.providerJobId,
      });
    },
  );

  it.each([
    ["decoded display-none", '<span style="display:none">London,</span>Remote'],
    [
      "entity-encoded visibility-hidden",
      "&lt;span style=&quot;visibility: hidden&quot;&gt;London,&lt;/span&gt;Remote",
    ],
  ])(
    "ignores %s location text when assessing UK eligibility",
    async (_case, location) => {
      await expect(
        normaliseProviderJob(source, {
          ...baseJob,
          title: "US Engineer",
          location,
          descriptionHtml: "<p>Visible engineering role.</p>",
        }),
      ).resolves.toEqual({
        outcome: "quarantined",
        reason: "ambiguous_uk_eligibility",
        providerJobId: baseJob.providerJobId,
      });
    },
  );

  it.each([
    [
      "decoded hidden",
      "<p>Visible engineering role.</p><div hidden>role is based in UK</div>",
    ],
    [
      "entity-encoded display-none",
      "&lt;p&gt;Visible engineering role.&lt;/p&gt;&lt;div style=&quot;display: none&quot;&gt;role is based in UK&lt;/div&gt;",
    ],
  ])(
    "ignores %s description text when assessing UK eligibility",
    async (_case, descriptionHtml) => {
      await expect(
        normaliseProviderJob(source, {
          ...baseJob,
          title: "US Engineer",
          location: "Remote",
          descriptionHtml,
        }),
      ).resolves.toEqual({
        outcome: "quarantined",
        reason: "ambiguous_uk_eligibility",
        providerJobId: baseJob.providerJobId,
      });
    },
  );

  it.each([
    ["decoded iframe", "<iframe>role is based in UK</iframe>"],
    [
      "entity-encoded object",
      "&lt;object&gt;role is based in UK&lt;/object&gt;",
    ],
  ])(
    "ignores %s metadata text when assessing UK eligibility",
    async (_case, metadata) => {
      await expect(
        normaliseProviderJob(source, {
          ...baseJob,
          title: "US Engineer",
          location: "Remote",
          descriptionHtml: "<p>Visible engineering role.</p>",
          metadataText: [metadata],
        }),
      ).resolves.toEqual({
        outcome: "quarantined",
        reason: "ambiguous_uk_eligibility",
        providerJobId: baseJob.providerJobId,
      });
    },
  );

  it("does not let hidden description or metadata alter job classifications", async () => {
    const job = await eligibleJob({
      ...baseJob,
      title: "Delivery Specialist",
      location: "London, England",
      descriptionHtml:
        '<p>Visible opportunity.</p><div style="visibility:hidden">Contract outside IR35 remote role.</div>',
      metadataText: [
        '<span aria-hidden="true">Hybrid role paying £900 per day</span>',
        "Visible team: Delivery",
      ],
    });

    expect(job).toMatchObject({
      descriptionText: "Visible opportunity.",
      employmentType: "unknown",
      workplaceType: "unknown",
      ir35Status: "unknown",
      compensationRaw: null,
      compensationMinimum: null,
      compensationMaximum: null,
      compensationCurrency: null,
      compensationPeriod: "unknown",
    });
  });

  it("applies static visibility rules while preserving genuinely visible dialog and details text", () => {
    const html = [
      "<audio>HIDDEN_AUDIO</audio>",
      "<video>HIDDEN_VIDEO</video>",
      "<picture><span>HIDDEN_PICTURE</span></picture>",
      "<datalist><span>HIDDEN_DATALIST</span></datalist>",
      "<meter>HIDDEN_METER</meter>",
      "<progress>HIDDEN_PROGRESS</progress>",
      "<dialog>HIDDEN_CLOSED_DIALOG</dialog>",
      "<dialog open>Visible dialog. </dialog>",
      "<details><summary>Visible closed summary. </summary>HIDDEN_CLOSED_DETAILS<p>HIDDEN_DETAILS_BODY</p></details>",
      "<details open><summary>Visible open summary. </summary><p>Visible open details. </p></details>",
      "<aside popover>HIDDEN_POPOVER</aside>",
      "<p>Visible ordinary text.</p>",
    ].join("");

    expect(htmlToPlainText(html)).toBe(
      "Visible dialog. Visible closed summary. Visible open summary. Visible open details. Visible ordinary text.",
    );
  });

  it("ignores decoded audio fallback text in provider titles", async () => {
    await expect(
      normaliseProviderJob(source, {
        ...baseJob,
        title: "<audio>role is based in UK</audio> US Engineer",
        location: "Remote",
        descriptionHtml: "<p>Visible engineering role.</p>",
      }),
    ).resolves.toEqual({
      outcome: "quarantined",
      reason: "ambiguous_uk_eligibility",
      providerJobId: baseJob.providerJobId,
    });
  });

  it("ignores entity-encoded video fallback text in provider locations", async () => {
    await expect(
      normaliseProviderJob(source, {
        ...baseJob,
        title: "US Engineer",
        location: "&lt;video&gt;London,&lt;/video&gt;Remote",
        descriptionHtml: "<p>Visible engineering role.</p>",
      }),
    ).resolves.toEqual({
      outcome: "quarantined",
      reason: "ambiguous_uk_eligibility",
      providerJobId: baseJob.providerJobId,
    });
  });

  it("ignores nested-encoded audio fallback text in descriptions", async () => {
    await expect(
      normaliseProviderJob(source, {
        ...baseJob,
        title: "US Engineer",
        location: "Remote",
        descriptionHtml:
          "<p>Visible engineering role.</p>&amp;lt;audio&amp;gt;role is based in UK&amp;lt;/audio&amp;gt;",
      }),
    ).resolves.toEqual({
      outcome: "quarantined",
      reason: "ambiguous_uk_eligibility",
      providerJobId: baseJob.providerJobId,
    });
  });

  it("ignores decoded video fallback text in metadata", async () => {
    await expect(
      normaliseProviderJob(source, {
        ...baseJob,
        title: "US Engineer",
        location: "Remote",
        descriptionHtml: "<p>Visible engineering role.</p>",
        metadataText: ["<video>role is based in UK</video>"],
      }),
    ).resolves.toEqual({
      outcome: "quarantined",
      reason: "ambiguous_uk_eligibility",
      providerJobId: baseJob.providerJobId,
    });
  });

  it("does not let decoded or nested media fallback text alter classifications", async () => {
    const job = await eligibleJob({
      ...baseJob,
      title: "Delivery Specialist",
      location: "London, England",
      descriptionHtml:
        "<p>Visible opportunity.</p><video>Contract outside IR35 remote role.</video>",
      metadataText: [
        "&amp;lt;audio&amp;gt;Hybrid role paying £800 per day&amp;lt;/audio&amp;gt;",
        "Visible team: Delivery",
      ],
    });

    expect(job).toMatchObject({
      descriptionText: "Visible opportunity.",
      employmentType: "unknown",
      workplaceType: "unknown",
      ir35Status: "unknown",
      compensationRaw: null,
      compensationMinimum: null,
      compensationMaximum: null,
      compensationCurrency: null,
      compensationPeriod: "unknown",
    });
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

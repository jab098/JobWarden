import { describe, expect, it } from "vitest";

import type {
  CareerEvidenceItem,
  NamedSearchProfileDraft,
} from "./career-profile.ts";
import {
  announcementKey,
  buildDigestMessage,
  londonSlotKey,
  selectNewMatches,
  type NotificationSearchProfile,
} from "./notifications.ts";
import type { TargetFeedJobInput } from "./target-feed.ts";

function baseProfile(
  overrides: Partial<NamedSearchProfileDraft> = {},
): NamedSearchProfileDraft {
  return {
    name: "Analytics implementation",
    enabled: true,
    roleFamilies: [],
    includeTerms: [],
    excludeTerms: [],
    industries: [],
    domains: [],
    skillConcepts: ["python"],
    responsibilityConcepts: [],
    currentSeniority: "senior",
    targetSeniority: "senior",
    employmentTypes: [],
    workingTimes: [],
    workplaceTypes: [],
    ukLocations: [],
    ir35Statuses: [],
    compensation: {
      minimum: null,
      maximum: null,
      period: "unknown",
      allowUnknown: true,
    },
    recencyDays: 30,
    notificationsEnabled: true,
    ...overrides,
  };
}

function search(
  id: string,
  overrides: Partial<NamedSearchProfileDraft> = {},
): NotificationSearchProfile {
  return { id, draft: baseProfile(overrides) };
}

function baseJob(
  overrides: Partial<TargetFeedJobInput> = {},
): TargetFeedJobInput {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Senior Analytics Engineer",
    employer: "Fictionex Ltd",
    descriptionText:
      "We are hiring a senior analytics engineer with python experience to own measurement.",
    location: "Manchester, UK",
    employmentType: "permanent",
    workingTime: "full_time",
    workplaceType: "hybrid",
    ir35Status: "not_applicable",
    compensationMinimum: null,
    compensationMaximum: null,
    compensationPeriod: "unknown",
    compensationProvenance: "unknown",
    postedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

const now = new Date("2026-07-20T08:10:00.000Z");

function evidence(): CareerEvidenceItem[] {
  return [
    {
      id: "71000000-0000-4000-8000-000000000001",
      normalizedConcept: "python",
      label: "Python",
      category: "skill",
      origin: "user",
      confidence: 1,
      evidenceReference: null,
      evidenceExcerpt: null,
      proficiencySignal: "demonstrated",
      lastUsedAt: null,
      confirmationState: "confirmed",
    },
  ];
}

describe("londonSlotKey", () => {
  it.each([
    ["2026-07-20T08:10:00.000Z", "2026-07-20T09"],
    ["2026-07-20T11:00:00.000Z", "2026-07-20T12"],
    ["2026-07-20T14:59:00.000Z", "2026-07-20T15"],
    ["2026-07-20T17:30:00.000Z", "2026-07-20T18"],
  ])("maps British Summer Time %s to slot %s", (instant, expected) => {
    expect(londonSlotKey(new Date(instant))).toBe(expected);
  });

  it("maps a Greenwich Mean Time slot without a summer-time offset", () => {
    // 2026-01-19 is a Monday outside British Summer Time.
    expect(londonSlotKey(new Date("2026-01-19T09:05:00.000Z"))).toBe(
      "2026-01-19T09",
    );
  });

  it("returns null outside the scheduled hours", () => {
    expect(londonSlotKey(new Date("2026-07-20T09:30:00.000Z"))).toBeNull();
  });

  it.each([
    ["2026-07-18T08:10:00.000Z", "Saturday"],
    ["2026-07-19T08:10:00.000Z", "Sunday"],
  ])("returns null on %s (%s)", (instant) => {
    expect(londonSlotKey(new Date(instant))).toBeNull();
  });
});

describe("selectNewMatches", () => {
  it("returns an eligible match with its announcement key", () => {
    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [search("20000000-0000-4000-8000-000000000001")],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      jobId: "10000000-0000-4000-8000-000000000001",
      title: "Senior Analytics Engineer",
      employer: "Fictionex Ltd",
      profileName: "Analytics implementation",
    });
    expect(result.announcements).toEqual([
      {
        searchProfileId: "20000000-0000-4000-8000-000000000001",
        jobId: "10000000-0000-4000-8000-000000000001",
      },
    ]);
  });

  it("skips a pair that was already announced", () => {
    const searchId = "20000000-0000-4000-8000-000000000001";
    const jobId = "10000000-0000-4000-8000-000000000001";

    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [search(searchId)],
      confirmedEvidence: evidence(),
      announced: new Set([announcementKey(searchId, jobId)]),
      now,
    });

    expect(result.jobs).toEqual([]);
    expect(result.announcements).toEqual([]);
  });

  it("still announces a job for a second profile that has not seen it", () => {
    const firstId = "20000000-0000-4000-8000-000000000001";
    const secondId = "20000000-0000-4000-8000-000000000002";
    const jobId = "10000000-0000-4000-8000-000000000001";

    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [
        search(firstId),
        search(secondId, { name: "Measurement contracts" }),
      ],
      confirmedEvidence: evidence(),
      announced: new Set([announcementKey(firstId, jobId)]),
      now,
    });

    expect(result.announcements).toEqual([
      { searchProfileId: secondId, jobId },
    ]);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.profileName).toBe("Measurement contracts");
  });

  it("reports one job but two announcements when two profiles both match", () => {
    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [
        search("20000000-0000-4000-8000-000000000001"),
        search("20000000-0000-4000-8000-000000000002", {
          name: "Measurement contracts",
        }),
      ],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.announcements).toHaveLength(2);
  });

  it("ignores a search profile with notifications disabled", () => {
    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [
        search("20000000-0000-4000-8000-000000000001", {
          notificationsEnabled: false,
        }),
      ],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs).toEqual([]);
  });

  it("ignores a disabled search profile", () => {
    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [
        search("20000000-0000-4000-8000-000000000001", { enabled: false }),
      ],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs).toEqual([]);
  });

  it("applies the hard eligibility gate before announcing", () => {
    const result = selectNewMatches({
      candidates: [baseJob({ workplaceType: "onsite" })],
      searches: [
        search("20000000-0000-4000-8000-000000000001", {
          workplaceTypes: ["remote"],
        }),
      ],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs).toEqual([]);
    expect(result.announcements).toEqual([]);
  });

  it("orders jobs by score, then recency, then id", () => {
    const result = selectNewMatches({
      candidates: [
        baseJob({
          id: "10000000-0000-4000-8000-00000000000a",
          title: "Data Coordinator",
          descriptionText: "Coordination work with no listed tooling.",
          postedAt: "2026-07-10T00:00:00.000Z",
        }),
        baseJob({
          id: "10000000-0000-4000-8000-00000000000b",
          postedAt: "2026-07-14T00:00:00.000Z",
        }),
        baseJob({
          id: "10000000-0000-4000-8000-00000000000c",
          postedAt: "2026-07-16T00:00:00.000Z",
        }),
      ],
      searches: [search("20000000-0000-4000-8000-000000000001")],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs.map((job) => job.jobId)).toEqual([
      "10000000-0000-4000-8000-00000000000c",
      "10000000-0000-4000-8000-00000000000b",
      "10000000-0000-4000-8000-00000000000a",
    ]);
  });

  it("keeps the highest scoring profile for a job listed once", () => {
    const result = selectNewMatches({
      candidates: [baseJob()],
      searches: [
        search("20000000-0000-4000-8000-000000000001", {
          name: "Weak overlap",
          skillConcepts: ["cobol"],
        }),
        search("20000000-0000-4000-8000-000000000002", {
          name: "Strong overlap",
          skillConcepts: ["python"],
        }),
      ],
      confirmedEvidence: evidence(),
      announced: new Set(),
      now,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.profileName).toBe("Strong overlap");
  });
});

describe("buildDigestMessage", () => {
  const jobs = [
    {
      jobId: "10000000-0000-4000-8000-000000000001",
      title: "Senior Analytics Engineer",
      employer: "Fictionex Ltd",
      location: "Manchester, UK",
      profileName: "Analytics implementation",
    },
    {
      jobId: "10000000-0000-4000-8000-000000000002",
      title: "Measurement Lead",
      employer: "Northgate Fiction Ltd",
      location: "Leeds, UK",
      profileName: "Analytics implementation",
    },
  ];
  const urls = {
    siteUrl: "https://jobwarden.example",
    unsubscribeUrl: "https://jobwarden.example/unsubscribe?token=abc",
  };

  it("states the true total in the subject", () => {
    const message = buildDigestMessage({ jobs, ...urls });
    expect(message.subject).toBe("2 new UK matches in JobWarden");
  });

  it("uses singular wording for one match", () => {
    const message = buildDigestMessage({ jobs: jobs.slice(0, 1), ...urls });
    expect(message.subject).toBe("1 new UK match in JobWarden");
  });

  it("states the true total even when the listing is capped", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...jobs[0],
      jobId: `10000000-0000-4000-8000-00000000000${index}`,
      title: `Analytics Engineer ${index}`,
    }));

    const message = buildDigestMessage({ jobs: many, ...urls, maxListed: 3 });

    expect(message.subject).toBe("9 new UK matches in JobWarden");
    expect(message.text).toContain("Analytics Engineer 0");
    expect(message.text).not.toContain("Analytics Engineer 3");
    expect(message.text).toContain("6 more");
  });

  it("links to the target feed and the unsubscribe page", () => {
    const message = buildDigestMessage({ jobs, ...urls });
    expect(message.text).toContain("https://jobwarden.example/jobs");
    expect(message.text).toContain(urls.unsubscribeUrl);
    expect(message.html).toContain('href="https://jobwarden.example/jobs"');
    expect(message.html).toContain(`href="${urls.unsubscribeUrl}"`);
  });

  it("escapes provider text so an advert cannot inject markup", () => {
    const message = buildDigestMessage({
      jobs: [
        {
          ...jobs[0],
          title: '<script>alert("x")</script> & Co',
          employer: 'Fictionex "Quoted" Ltd',
        },
      ],
      ...urls,
    });

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("&amp; Co");
    expect(message.html).toContain("&quot;Quoted&quot;");
  });

  it("carries no career evidence into the payload", () => {
    const message = buildDigestMessage({ jobs, ...urls });
    const payload = `${message.subject}${message.text}${message.html}`;

    for (const forbidden of [
      "Python",
      "python",
      "evidence",
      "skill",
      "CV",
      "score",
    ]) {
      expect(payload).not.toContain(forbidden);
    }
  });
});

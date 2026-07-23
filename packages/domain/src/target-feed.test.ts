import { describe, expect, it } from "vitest";

import type {
  CareerEvidenceItem,
  NamedSearchProfileDraft,
} from "./career-profile.ts";
import {
  applyEligibilityGate,
  collectRetrievalTerms,
  meetsRelevanceThreshold,
  profileHasCoreConcepts,
  scoreJobForProfile,
  TARGET_FEED_MIN_CORE_MATCHES,
  type TargetFeedExplanation,
  type TargetFeedJobInput,
} from "./target-feed.ts";

function baseProfile(
  overrides: Partial<NamedSearchProfileDraft> = {},
): NamedSearchProfileDraft {
  return {
    name: "Backend engineering",
    enabled: true,
    roleFamilies: [],
    includeTerms: [],
    excludeTerms: [],
    industries: [],
    domains: [],
    skillConcepts: [],
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
    notificationsEnabled: false,
    ...overrides,
  };
}

function baseJob(
  overrides: Partial<TargetFeedJobInput> = {},
): TargetFeedJobInput {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Senior Backend Engineer",
    employer: "Fictionex Ltd",
    descriptionText:
      "We are hiring a senior backend engineer with python and postgres experience to own service reliability.",
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

function evidenceItem(
  overrides: Partial<CareerEvidenceItem> = {},
): CareerEvidenceItem {
  return {
    id: "71000000-0000-4000-8000-000000000001",
    normalizedConcept: "python",
    label: "Python",
    category: "skill",
    origin: "cv",
    confidence: 0.9,
    evidenceReference: "72000000-0000-4000-8000-000000000001:paragraph:1",
    evidenceExcerpt: "Built services in Python.",
    proficiencySignal: "advanced",
    lastUsedAt: null,
    confirmationState: "confirmed",
    ...overrides,
  };
}

const now = new Date("2026-07-18T00:00:00.000Z");

describe("applyEligibilityGate", () => {
  it("excludes a known employment type outside a non-empty allow-list", () => {
    const profile = baseProfile({ employmentTypes: ["contract"] });
    const job = baseJob({ employmentType: "permanent" });
    const result = applyEligibilityGate(job, profile, now);
    expect(result).toEqual({
      eligible: false,
      exclusions: [{ reason: "employment_type" }],
    });
  });

  it("never excludes an unknown employment type even with a non-empty allow-list", () => {
    const profile = baseProfile({ employmentTypes: ["contract"] });
    const job = baseJob({ employmentType: "unknown" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("excludes a known working time outside a non-empty allow-list", () => {
    const profile = baseProfile({ workingTimes: ["part_time"] });
    const job = baseJob({ workingTime: "full_time" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "working_time" }],
    });
  });

  it("excludes a known workplace type outside a non-empty allow-list", () => {
    const profile = baseProfile({ workplaceTypes: ["remote"] });
    const job = baseJob({ workplaceType: "onsite" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "workplace" }],
    });
  });

  it("excludes a known IR35 status outside a non-empty allow-list", () => {
    const profile = baseProfile({ ir35Statuses: ["outside"] });
    const job = baseJob({ ir35Status: "inside" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "ir35" }],
    });
  });

  it("excludes a location that does not match any configured UK location", () => {
    const profile = baseProfile({ ukLocations: ["London"] });
    const job = baseJob({
      location: "Manchester, UK",
      workplaceType: "onsite",
    });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "location" }],
    });
  });

  it("passes the location gate for a remote job regardless of configured UK locations", () => {
    const profile = baseProfile({ ukLocations: ["London"] });
    const job = baseJob({
      location: "Manchester, UK",
      workplaceType: "remote",
    });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("excludes a job whose title contains a whole-word excluded term", () => {
    const profile = baseProfile({ excludeTerms: ["sales"] });
    const job = baseJob({ title: "Senior Sales Engineer" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "excluded_term" }],
    });
  });

  it("does not exclude on a partial-word match of an excluded term", () => {
    const profile = baseProfile({ excludeTerms: ["sale"] });
    const job = baseJob({ title: "Senior Salesforce Engineer" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("excludes a job posted before the recency window", () => {
    const profile = baseProfile({ recencyDays: 7 });
    const job = baseJob({ postedAt: "2026-06-01T00:00:00.000Z" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "recency" }],
    });
  });

  it("never excludes a job with an unknown posted date", () => {
    const profile = baseProfile({ recencyDays: 1 });
    const job = baseJob({ postedAt: null });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("excludes known compensation below the profile minimum in a matching period", () => {
    const profile = baseProfile({
      compensation: {
        minimum: 50_000,
        maximum: null,
        period: "year",
        allowUnknown: true,
      },
    });
    const job = baseJob({
      compensationMinimum: 40_000,
      compensationMaximum: 45_000,
      compensationPeriod: "year",
      compensationProvenance: "advertised",
    });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "compensation_below_minimum", minimum: 50_000 }],
    });
  });

  it("does not exclude below-minimum compensation when the job period is unknown", () => {
    const profile = baseProfile({
      compensation: {
        minimum: 50_000,
        maximum: null,
        period: "year",
        allowUnknown: true,
      },
    });
    const job = baseJob({
      compensationMinimum: 40_000,
      compensationMaximum: 45_000,
      compensationPeriod: "unknown",
      compensationProvenance: "advertised",
    });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("never converts between mismatched known periods", () => {
    const profile = baseProfile({
      compensation: {
        minimum: 50_000,
        maximum: null,
        period: "year",
        allowUnknown: true,
      },
    });
    const job = baseJob({
      compensationMinimum: 200,
      compensationMaximum: 250,
      compensationPeriod: "day",
      compensationProvenance: "advertised",
    });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("excludes unknown compensation when the profile disallows it", () => {
    const profile = baseProfile({
      compensation: {
        minimum: null,
        maximum: null,
        period: "unknown",
        allowUnknown: false,
      },
    });
    const job = baseJob({ compensationProvenance: "unknown" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "unknown_compensation_disallowed" }],
    });
  });

  it("allows unknown compensation when the profile allows it", () => {
    const profile = baseProfile({
      compensation: {
        minimum: null,
        maximum: null,
        period: "unknown",
        allowUnknown: true,
      },
    });
    const job = baseJob({ compensationProvenance: "unknown" });
    expect(applyEligibilityGate(job, profile, now)).toEqual({ eligible: true });
  });

  it("collects every applicable exclusion", () => {
    const profile = baseProfile({
      employmentTypes: ["contract"],
      excludeTerms: ["backend"],
    });
    const job = baseJob({
      employmentType: "permanent",
      title: "Senior Backend Engineer",
    });
    expect(applyEligibilityGate(job, profile, now)).toEqual({
      eligible: false,
      exclusions: [{ reason: "employment_type" }, { reason: "excluded_term" }],
    });
  });
});

describe("scoreJobForProfile: skills and responsibilities", () => {
  it("awards zero skills when the candidate set is empty", () => {
    const profile = baseProfile();
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    const skills = explanation.components.find((c) => c.key === "skills");
    expect(skills).toMatchObject({
      weight: 45,
      awarded: 0,
      matched: [],
      gaps: [],
    });
  });

  it("awards the full skills weight when all profile skill concepts match", () => {
    const profile = baseProfile({ skillConcepts: ["python", "postgres"] });
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    const skills = explanation.components.find((c) => c.key === "skills");
    expect(skills?.awarded).toBe(45);
    expect([...(skills?.matched ?? [])].sort()).toEqual(["postgres", "python"]);
    expect(skills?.gaps).toEqual([]);
  });

  it("awards a rounded partial skills score and lists unmatched profile concepts as gaps", () => {
    const profile = baseProfile({ skillConcepts: ["python", "kubernetes"] });
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    const skills = explanation.components.find((c) => c.key === "skills");
    expect(skills?.awarded).toBe(23); // round(45 * 1/2)
    expect(skills?.matched).toEqual(["python"]);
    expect(skills?.gaps).toEqual(["kubernetes"]);
  });

  it("credits confirmed skill and tool evidence toward the skills candidate set", () => {
    const profile = baseProfile();
    const job = baseJob({
      descriptionText: `${baseJob().descriptionText} We use Terraform daily.`,
    });
    const evidence = [
      evidenceItem({
        id: "71000000-0000-4000-8000-000000000002",
        normalizedConcept: "terraform",
        label: "Terraform",
        category: "tool",
      }),
    ];
    const explanation = scoreJobForProfile(job, profile, evidence, now);
    const skills = explanation.components.find((c) => c.key === "skills");
    expect(skills?.awarded).toBe(45);
    expect(skills?.matched).toEqual(["Terraform"]);
  });

  it("does not credit evidence categories outside skill or tool toward skills", () => {
    const profile = baseProfile();
    const job = baseJob();
    const evidence = [
      evidenceItem({
        id: "71000000-0000-4000-8000-000000000003",
        normalizedConcept: "service reliability",
        label: "Service reliability",
        category: "responsibility",
      }),
    ];
    const explanation = scoreJobForProfile(job, profile, evidence, now);
    const skills = explanation.components.find((c) => c.key === "skills");
    expect(skills?.awarded).toBe(0);
  });

  it("scores responsibilities using profile concepts unioned with confirmed responsibility evidence", () => {
    const profile = baseProfile({
      responsibilityConcepts: ["service reliability"],
    });
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    const responsibilities = explanation.components.find(
      (c) => c.key === "responsibilities",
    );
    expect(responsibilities).toMatchObject({ weight: 20, awarded: 20 });
    expect(responsibilities?.matched).toEqual(["service reliability"]);
  });
});

describe("scoreJobForProfile: seniority", () => {
  it("awards the neutral score when no seniority marker is present in the title", () => {
    const profile = baseProfile({ targetSeniority: "senior" });
    const job = baseJob({ title: "Backend Engineer" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const seniority = explanation.components.find((c) => c.key === "seniority");
    expect(seniority).toMatchObject({
      weight: 15,
      awarded: 10,
      matched: [],
      gaps: [],
    });
  });

  it("awards full seniority credit when the detected marker equals the target", () => {
    const profile = baseProfile({ targetSeniority: "senior" });
    const job = baseJob({ title: "Senior Backend Engineer" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const seniority = explanation.components.find((c) => c.key === "seniority");
    expect(seniority?.awarded).toBe(15);
  });

  it("awards adjacent-level credit for a neighbouring seniority marker", () => {
    const profile = baseProfile({ targetSeniority: "senior" });
    const job = baseJob({ title: "Lead Backend Engineer" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const seniority = explanation.components.find((c) => c.key === "seniority");
    expect(seniority?.awarded).toBe(8);
  });

  it("awards zero seniority credit for a distant mismatched marker", () => {
    const profile = baseProfile({ targetSeniority: "senior" });
    const job = baseJob({ title: "Graduate Backend Engineer" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const seniority = explanation.components.find((c) => c.key === "seniority");
    expect(seniority?.awarded).toBe(0);
  });

  it("awards the neutral score for any marker when the target seniority is unspecified", () => {
    const profile = baseProfile({ targetSeniority: "unspecified" });
    const job = baseJob({ title: "Senior Backend Engineer" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const seniority = explanation.components.find((c) => c.key === "seniority");
    expect(seniority?.awarded).toBe(10);
  });

  it("detects the director marker family", () => {
    const profile = baseProfile({ targetSeniority: "director" });
    const job = baseJob({ title: "VP of Engineering" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const seniority = explanation.components.find((c) => c.key === "seniority");
    expect(seniority?.awarded).toBe(15);
  });
});

describe("scoreJobForProfile: industry and domain", () => {
  it("awards the full industry weight when unconstrained", () => {
    const profile = baseProfile({ industries: [], domains: [] });
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    const industry = explanation.components.find((c) => c.key === "industry");
    expect(industry).toMatchObject({ weight: 10, awarded: 10 });
  });

  it("awards a fraction of the industry weight for partial matches across industries and domains", () => {
    const profile = baseProfile({
      industries: [{ normalizedConcept: "fintech", label: "Fintech" }],
      domains: [{ normalizedConcept: "payments", label: "Payments" }],
    });
    const job = baseJob({
      descriptionText: `${baseJob().descriptionText} We operate in fintech.`,
    });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const industry = explanation.components.find((c) => c.key === "industry");
    expect(industry?.awarded).toBe(5); // round(10 * 1/2)
    expect(industry?.matched).toEqual(["Fintech"]);
    expect(industry?.gaps).toEqual(["Payments"]);
  });
});

describe("scoreJobForProfile: preference fit", () => {
  it("awards two points per known matching preference and totals ten when unconstrained", () => {
    const profile = baseProfile();
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    const preference = explanation.components.find(
      (c) => c.key === "preference_fit",
    );
    expect(preference).toMatchObject({ weight: 10, awarded: 10 });
  });

  it("awards one point for an unknown job value against a non-empty preference selection", () => {
    const profile = baseProfile({ employmentTypes: ["permanent"] });
    const job = baseJob({ employmentType: "unknown" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    const preference = explanation.components.find(
      (c) => c.key === "preference_fit",
    );
    expect(preference?.awarded).toBe(9); // 1 for employment type, 2 for the other four
  });
});

describe("scoreJobForProfile: synonym credit", () => {
  it("does not credit an include term without matching role or responsibility evidence", () => {
    const profile = baseProfile({ includeTerms: ["backend engineer"] });
    const job = baseJob({ title: "Senior Backend Engineer" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    expect(explanation.synonymCredits).toEqual([]);
  });

  it("credits an include term only when confirmed role or responsibility evidence also matched", () => {
    const profile = baseProfile({ includeTerms: ["backend engineer"] });
    const job = baseJob({ title: "Senior Backend Engineer" });
    const evidence = [
      evidenceItem({
        id: "71000000-0000-4000-8000-000000000004",
        normalizedConcept: "service reliability",
        label: "Service reliability",
        category: "responsibility",
      }),
    ];
    const explanation = scoreJobForProfile(job, profile, evidence, now);
    expect(explanation.synonymCredits).toEqual([
      { term: "backend engineer", evidenceLabel: "Service reliability" },
    ]);
  });
});

describe("scoreJobForProfile: compensation treatment never affects score", () => {
  it("produces identical scores for a high-salary job and an unknown-salary twin", () => {
    const profile = baseProfile({
      skillConcepts: ["python"],
      compensation: {
        minimum: 50_000,
        maximum: null,
        period: "year",
        allowUnknown: true,
      },
    });
    const highSalaryJob = baseJob({
      compensationMinimum: 500_000,
      compensationMaximum: 600_000,
      compensationPeriod: "year",
      compensationProvenance: "advertised",
    });
    const unknownSalaryJob = baseJob({
      compensationMinimum: null,
      compensationMaximum: null,
      compensationPeriod: "unknown",
      compensationProvenance: "unknown",
    });
    const highSalaryExplanation = scoreJobForProfile(
      highSalaryJob,
      profile,
      [],
      now,
    );
    const unknownSalaryExplanation = scoreJobForProfile(
      unknownSalaryJob,
      profile,
      [],
      now,
    );
    expect(highSalaryExplanation.score).toBe(unknownSalaryExplanation.score);
    expect(highSalaryExplanation.components).toEqual(
      unknownSalaryExplanation.components,
    );
  });

  it("reports advertised compensation within preference", () => {
    const profile = baseProfile({
      compensation: {
        minimum: 50_000,
        maximum: 80_000,
        period: "year",
        allowUnknown: true,
      },
    });
    const job = baseJob({
      compensationMinimum: 60_000,
      compensationMaximum: 70_000,
      compensationPeriod: "year",
      compensationProvenance: "advertised",
    });
    const explanation = scoreJobForProfile(job, profile, [], now);
    expect(explanation.compensationTreatment).toEqual({
      kind: "advertised",
      withinPreference: true,
    });
  });

  it("reports unknown compensation as an explicit allowed state", () => {
    const profile = baseProfile();
    const job = baseJob({ compensationProvenance: "unknown" });
    const explanation = scoreJobForProfile(job, profile, [], now);
    expect(explanation.compensationTreatment).toEqual({
      kind: "unknown",
      allowed: true,
    });
  });
});

describe("scoreJobForProfile: explanation payload", () => {
  it("caps important gaps at six, deduplicated, in component order", () => {
    const profile = baseProfile({
      skillConcepts: ["a1", "a2", "a3", "a4"],
      responsibilityConcepts: ["b1", "b2", "b3"],
      industries: [{ normalizedConcept: "fintech", label: "Fintech" }],
    });
    const job = baseJob({
      title: "Backend Engineer",
      descriptionText: "Generic role.",
    });
    const explanation = scoreJobForProfile(job, profile, [], now);
    expect(explanation.importantGaps.length).toBeLessThanOrEqual(6);
    expect(new Set(explanation.importantGaps).size).toBe(
      explanation.importantGaps.length,
    );
  });

  it("is deterministic for identical inputs", () => {
    const profile = baseProfile({
      skillConcepts: ["python"],
      responsibilityConcepts: ["service reliability"],
      includeTerms: ["backend engineer"],
    });
    const job = baseJob();
    const evidence = [
      evidenceItem({
        id: "71000000-0000-4000-8000-000000000005",
        normalizedConcept: "service reliability",
        label: "Service reliability",
        category: "role_history",
      }),
    ];
    const first = scoreJobForProfile(job, profile, evidence, now);
    const second = scoreJobForProfile(job, profile, evidence, now);
    expect(first).toEqual(second);
  });

  it("keeps the total score an integer between zero and one hundred", () => {
    const profile = baseProfile({
      skillConcepts: ["python", "postgres", "redis"],
    });
    const job = baseJob();
    const explanation = scoreJobForProfile(job, profile, [], now);
    expect(Number.isInteger(explanation.score)).toBe(true);
    expect(explanation.score).toBeGreaterThanOrEqual(0);
    expect(explanation.score).toBeLessThanOrEqual(100);
    const sum = explanation.components.reduce(
      (total, c) => total + c.awarded,
      0,
    );
    expect(explanation.score).toBe(sum);
  });

  it("carries the profile name and matched evidence labels", () => {
    const profile = baseProfile({ name: "Backend engineering" });
    const job = baseJob();
    const evidence = [evidenceItem()];
    const explanation = scoreJobForProfile(job, profile, evidence, now);
    expect(explanation.profileName).toBe("Backend engineering");
    expect(explanation.matchedEvidence).toContain("Python");
  });

  it("deduplicates matched evidence labels shared by two confirmed items", () => {
    const profile = baseProfile({ name: "Backend engineering" });
    const job = baseJob();
    const evidence = [
      evidenceItem({
        id: "71000000-0000-4000-8000-000000000001",
        normalizedConcept: "python",
        label: "Python",
      }),
      evidenceItem({
        id: "71000000-0000-4000-8000-000000000002",
        normalizedConcept: "python-scripting",
        label: "Python",
      }),
    ];
    const explanation = scoreJobForProfile(job, profile, evidence, now);
    expect(
      explanation.matchedEvidence.filter((label) => label === "Python"),
    ).toHaveLength(1);
  });
});

describe("profileHasCoreConcepts", () => {
  it("is true when the profile carries skill concepts", () => {
    expect(
      profileHasCoreConcepts(baseProfile({ skillConcepts: ["sql"] }), []),
    ).toBe(true);
  });

  it("is true when the profile carries responsibility concepts", () => {
    expect(
      profileHasCoreConcepts(
        baseProfile({ responsibilityConcepts: ["stakeholder management"] }),
        [],
      ),
    ).toBe(true);
  });

  it("is true when confirmed evidence carries a skill, tool, or responsibility", () => {
    expect(
      profileHasCoreConcepts(baseProfile(), [
        evidenceItem({ category: "tool" }),
      ]),
    ).toBe(true);
  });

  it("is false for an aspiration-only profile with no core concepts or evidence", () => {
    expect(profileHasCoreConcepts(baseProfile(), [])).toBe(false);
    // Industry evidence is not a core concept and must not flip the gate.
    expect(
      profileHasCoreConcepts(baseProfile(), [
        evidenceItem({ category: "industry" }),
      ]),
    ).toBe(false);
  });
});

describe("meetsRelevanceThreshold", () => {
  function explanationWith(
    core: { skills: number; responsibilities: number },
    matched: { skills: string[]; responsibilities: string[] },
  ): TargetFeedExplanation {
    return {
      profileName: "P",
      // Total score deliberately high, to prove the gate reads the core
      // components rather than the total the free points inflate.
      score: 90,
      components: [
        {
          key: "skills",
          weight: 45,
          awarded: core.skills,
          matched: matched.skills,
          gaps: [],
        },
        {
          key: "responsibilities",
          weight: 20,
          awarded: core.responsibilities,
          matched: matched.responsibilities,
          gaps: [],
        },
        { key: "seniority", weight: 15, awarded: 15, matched: [], gaps: [] },
        { key: "industry", weight: 10, awarded: 10, matched: [], gaps: [] },
        {
          key: "preference_fit",
          weight: 10,
          awarded: 10,
          matched: [],
          gaps: [],
        },
      ],
      matchedEvidence: [],
      importantGaps: [],
      synonymCredits: [],
      compensationTreatment: { kind: "unknown", allowed: true },
    };
  }

  // Two genuine core hits clear the bar — the job is about the profile's work.
  it("keeps a job that names at least the minimum core concepts", () => {
    const profile = baseProfile({ skillConcepts: ["python", "postgres"] });
    const explanation = scoreJobForProfile(baseJob(), profile, [], now);
    const coreMatches = explanation.components
      .filter((c) => c.key === "skills" || c.key === "responsibilities")
      .reduce((total, c) => total + c.matched.length, 0);
    expect(coreMatches).toBeGreaterThanOrEqual(TARGET_FEED_MIN_CORE_MATCHES);
    expect(meetsRelevanceThreshold(explanation, true)).toBe(true);
  });

  // The mass-match complaint: a job touching none of the profile's skills still
  // scores ~30 on free points. It must be dropped when the profile has skills.
  it("drops a job with zero core matches even though it scores on free points", () => {
    const profile = baseProfile({ skillConcepts: ["rust", "kubernetes"] });
    const explanation = scoreJobForProfile(baseJob(), profile, [], now);
    expect(explanation.score).toBeGreaterThan(0); // free points were awarded
    expect(meetsRelevanceThreshold(explanation, true)).toBe(false);
  });

  // A single weak hit (one tool of many) is not enough, whatever the total
  // score — the gate counts distinct core concepts named, not points.
  it("drops a single core hit below the minimum match count", () => {
    const oneHit = explanationWith(
      { skills: 45, responsibilities: 0 }, // deliberately high points
      { skills: ["SQL"], responsibilities: [] },
    );
    expect(meetsRelevanceThreshold(oneHit, true)).toBe(false);
  });

  // The regression this fix closes: a broad profile whose genuine two-skill
  // match is averaged down to a handful of points. A points floor emptied its
  // feed; the match count keeps it. This is the "130 matches, then 0" bug.
  it("keeps a broad-profile match whose averaged core points are low", () => {
    const dilutedButRelevant = explanationWith(
      { skills: 6, responsibilities: 0 }, // e.g. round(45 * 2 / 15) — far below any points floor
      { skills: ["Python", "Postgres"], responsibilities: [] },
    );
    expect(meetsRelevanceThreshold(dilutedButRelevant, true)).toBe(true);
  });

  // A skill hit and a responsibility hit together reach the minimum: matching
  // the actual work across both core components qualifies.
  it("counts skill and responsibility matches together toward the minimum", () => {
    const mixed = explanationWith(
      { skills: 3, responsibilities: 4 },
      { skills: ["Python"], responsibilities: ["Analytics implementation"] },
    );
    expect(meetsRelevanceThreshold(mixed, true)).toBe(true);
  });

  // An aspiration profile has nothing to require a core hit against, so it is
  // left alone rather than emptied.
  it("leaves an aspiration profile (no core concepts) unfiltered", () => {
    const explanation = scoreJobForProfile(baseJob(), baseProfile(), [], now);
    expect(meetsRelevanceThreshold(explanation, false)).toBe(true);
  });
});

describe("collectRetrievalTerms", () => {
  it("gathers distinct lowercased core terms from profiles and confirmed evidence", () => {
    const profile = baseProfile({
      skillConcepts: ["Python"],
      responsibilityConcepts: ["Analytics implementation"],
    });
    const evidence = [
      evidenceItem({
        category: "tool",
        label: "SQL",
        normalizedConcept: "sql",
      }),
      // Industry evidence is not a core concept and must be ignored.
      evidenceItem({
        category: "industry",
        label: "Fintech",
        normalizedConcept: "fintech",
      }),
    ];

    const terms = collectRetrievalTerms([profile], evidence);

    expect(terms).toContain("python");
    expect(terms).toContain("analytics implementation");
    expect(terms).toContain("sql");
    expect(terms).not.toContain("fintech");
  });

  it("returns nothing for an aspiration profile with no core concepts", () => {
    expect(collectRetrievalTerms([baseProfile()], [])).toEqual([]);
  });
});

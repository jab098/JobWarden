import { describe, expect, it } from "vitest";

import {
  careerEvidenceItemSchema,
  careerProfileDraftSchema,
  namedSearchProfileDraftSchema,
  parseCareerProfileDraft,
  profileSuggestionSchema,
} from "./career-profile.ts";

const evidenceId = "71000000-0000-4000-8000-000000000001";
const cvDocumentId = "72000000-0000-4000-8000-000000000001";

describe("career profile contracts", () => {
  it("retains bounded CV evidence with provenance and review state", () => {
    expect(
      careerEvidenceItemSchema.parse({
        id: evidenceId,
        normalizedConcept: "analytics implementation",
        label: "Analytics implementation",
        category: "responsibility",
        origin: "cv",
        confidence: 0.92,
        evidenceReference: `${cvDocumentId}:paragraph:14`,
        evidenceExcerpt: "Implemented governed analytics instrumentation.",
        proficiencySignal: "advanced",
        lastUsedAt: "2026-06-30",
        confirmationState: "proposed",
      }),
    ).toMatchObject({
      origin: "cv",
      confirmationState: "proposed",
      normalizedConcept: "analytics implementation",
    });
  });

  it("rejects CV-derived evidence without a source reference", () => {
    expect(() =>
      careerEvidenceItemSchema.parse({
        id: evidenceId,
        normalizedConcept: "sql",
        label: "SQL",
        category: "tool",
        origin: "cv",
        confidence: 0.8,
        evidenceReference: null,
        evidenceExcerpt: null,
        proficiencySignal: "demonstrated",
        lastUsedAt: null,
        confirmationState: "proposed",
      }),
    ).toThrow(/reference/i);
  });

  it("rejects oversized evidence excerpts", () => {
    expect(() =>
      careerEvidenceItemSchema.parse({
        id: evidenceId,
        normalizedConcept: "consent management",
        label: "Consent management",
        category: "skill",
        origin: "user",
        confidence: 1,
        evidenceReference: null,
        evidenceExcerpt: "x".repeat(281),
        proficiencySignal: "demonstrated",
        lastUsedAt: null,
        confirmationState: "confirmed",
      }),
    ).toThrow();
  });

  it("rejects unexpected raw CV fields", () => {
    expect(() =>
      careerEvidenceItemSchema.parse({
        id: evidenceId,
        normalizedConcept: "consent management",
        label: "Consent management",
        category: "skill",
        origin: "user",
        confidence: 1,
        evidenceReference: null,
        evidenceExcerpt: null,
        proficiencySignal: "demonstrated",
        lastUsedAt: null,
        confirmationState: "confirmed",
        rawCvText: "must never be accepted",
      }),
    ).toThrow();
  });

  it("requires at least one useful onboarding signal", () => {
    expect(() =>
      parseCareerProfileDraft({
        cvDocumentId: null,
        currentSeniority: "senior",
        targetSeniority: "lead",
        evidence: [],
        targetRoleFamilies: [],
        industries: [],
        domains: [],
        keywords: [],
      }),
    ).toThrow(/one onboarding signal/i);
  });

  it("accepts role-only onboarding and preserves separate seniority choices", () => {
    const profile = parseCareerProfileDraft({
      cvDocumentId: null,
      currentSeniority: "senior",
      targetSeniority: "lead",
      evidence: [],
      targetRoleFamilies: [
        {
          normalizedConcept: "analytics implementation",
          label: "Analytics implementation",
        },
      ],
      industries: [],
      domains: [],
      keywords: [],
    });

    expect(profile.currentSeniority).toBe("senior");
    expect(profile.targetSeniority).toBe("lead");
  });

  it("treats confirmed user skills as a valid onboarding signal", () => {
    expect(
      careerProfileDraftSchema.parse({
        cvDocumentId: null,
        currentSeniority: "unspecified",
        targetSeniority: "unspecified",
        evidence: [
          {
            id: evidenceId,
            normalizedConcept: "tealium iq",
            label: "Tealium iQ",
            category: "tool",
            origin: "user",
            confidence: 1,
            evidenceReference: null,
            evidenceExcerpt: null,
            proficiencySignal: "demonstrated",
            lastUsedAt: null,
            confirmationState: "confirmed",
          },
        ],
        targetRoleFamilies: [],
        industries: [],
        domains: [],
        keywords: [],
      }).evidence,
    ).toHaveLength(1);
  });

  it("rejects duplicate normalised concepts even when labels differ", () => {
    expect(() =>
      parseCareerProfileDraft({
        cvDocumentId: null,
        currentSeniority: "mid",
        targetSeniority: "senior",
        evidence: [],
        targetRoleFamilies: [
          {
            normalizedConcept: "martech implementation",
            label: "MarTech implementation",
          },
          {
            normalizedConcept: "martech implementation",
            label: "Marketing technology implementation",
          },
        ],
        industries: [],
        domains: [],
        keywords: [],
      }),
    ).toThrow(/unique/i);
  });

  it("keeps machine suggestions inactive until explicitly accepted", () => {
    expect(
      profileSuggestionSchema.parse({
        id: "73000000-0000-4000-8000-000000000001",
        kind: "role_family",
        normalizedConcept: "analytics solutions consulting",
        label: "Analytics solutions consulting",
        confidence: 0.86,
        evidenceItemIds: [evidenceId],
        state: "proposed",
        proposedAt: "2026-07-18T10:00:00.000Z",
      }),
    ).toMatchObject({ state: "proposed" });
  });

  it("rejects suggestions without evidence and duplicate evidence IDs", () => {
    const suggestion = {
      id: "73000000-0000-4000-8000-000000000001",
      kind: "career_pathway",
      normalizedConcept: "event data governance",
      label: "Event-data governance",
      confidence: 0.76,
      state: "proposed",
      proposedAt: "2026-07-18T10:00:00.000Z",
    } as const;

    expect(() =>
      profileSuggestionSchema.parse({
        ...suggestion,
        evidenceItemIds: [],
      }),
    ).toThrow();
    expect(() =>
      profileSuggestionSchema.parse({
        ...suggestion,
        evidenceItemIds: [evidenceId, evidenceId],
      }),
    ).toThrow(/unique/i);
  });

  it("defines named searches without treating salary as a score", () => {
    const search = namedSearchProfileDraftSchema.parse({
      name: "MarTech contracts",
      enabled: true,
      roleFamilies: [
        {
          normalizedConcept: "martech implementation",
          label: "MarTech implementation",
        },
      ],
      includeTerms: ["implementation"],
      excludeTerms: ["sales"],
      industries: [],
      domains: [{ normalizedConcept: "martech", label: "MarTech" }],
      skillConcepts: ["analytics implementation"],
      responsibilityConcepts: ["stakeholder delivery"],
      currentSeniority: "senior",
      targetSeniority: "lead",
      employmentTypes: ["contract"],
      workingTimes: ["full_time"],
      workplaceTypes: ["hybrid", "remote"],
      ukLocations: ["London"],
      ir35Statuses: ["outside", "unknown"],
      compensation: {
        minimum: 50000,
        maximum: 75000,
        period: "day",
        allowUnknown: true,
      },
      recencyDays: 14,
      notificationsEnabled: false,
    });

    expect(search.compensation).toEqual({
      minimum: 50000,
      maximum: 75000,
      period: "day",
      allowUnknown: true,
    });
    expect(search).not.toHaveProperty("score");
  });

  it("allows an industry-only named search without inventing a role family", () => {
    expect(
      namedSearchProfileDraftSchema.parse({
        name: "Financial services opportunities",
        enabled: true,
        roleFamilies: [],
        includeTerms: [],
        excludeTerms: [],
        industries: [
          {
            normalizedConcept: "financial services",
            label: "Financial services",
          },
        ],
        domains: [],
        skillConcepts: [],
        responsibilityConcepts: [],
        currentSeniority: "unspecified",
        targetSeniority: "unspecified",
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
      }).industries,
    ).toHaveLength(1);
  });

  it("rejects a named search without any search signal", () => {
    expect(() =>
      namedSearchProfileDraftSchema.parse({
        name: "Empty search",
        enabled: true,
        roleFamilies: [],
        includeTerms: [],
        excludeTerms: [],
        industries: [],
        domains: [],
        skillConcepts: [],
        responsibilityConcepts: [],
        currentSeniority: "unspecified",
        targetSeniority: "unspecified",
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
      }),
    ).toThrow(/one search signal/i);
  });
});

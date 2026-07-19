import "server-only";

import type { CareerEvidenceItem } from "@jobwarden/domain";

import type { ProfileRepository } from "./repository";
import { ProfileRepositoryError } from "./repository";
import type { ProfileSnapshot } from "./types";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as object)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const evidenceIds = [
  "61000000-0000-4000-8000-000000000001",
  "61000000-0000-4000-8000-000000000002",
  "61000000-0000-4000-8000-000000000003",
  "61000000-0000-4000-8000-000000000004",
  "61000000-0000-4000-8000-000000000005",
  "61000000-0000-4000-8000-000000000006",
] as const;

const fictionalEvidence = [
  {
    id: evidenceIds[0],
    normalizedConcept: "analytics implementation",
    label: "Analytics implementation",
    category: "responsibility",
    origin: "cv",
    confidence: 0.96,
    evidenceReference: "character:44-68",
    evidenceExcerpt:
      "Fictional evidence: delivered governed analytics implementation programmes.",
    proficiencySignal: "advanced",
    lastUsedAt: "2026-06-30",
    confirmationState: "confirmed",
  },
  {
    id: evidenceIds[1],
    normalizedConcept: "stakeholder management",
    label: "Stakeholder management",
    category: "skill",
    origin: "cv",
    confidence: 0.96,
    evidenceReference: "character:112-134",
    evidenceExcerpt:
      "Fictional evidence: facilitated stakeholder decisions across delivery teams.",
    proficiencySignal: "advanced",
    lastUsedAt: "2026-06-30",
    confirmationState: "confirmed",
  },
  {
    id: evidenceIds[2],
    normalizedConcept: "sql",
    label: "SQL",
    category: "tool",
    origin: "cv",
    confidence: 0.99,
    evidenceReference: "character:188-191",
    evidenceExcerpt:
      "Fictional evidence: used SQL for implementation validation and analysis.",
    proficiencySignal: "demonstrated",
    lastUsedAt: null,
    confirmationState: "proposed",
  },
  {
    id: evidenceIds[3],
    normalizedConcept: "event instrumentation",
    label: "Event instrumentation",
    category: "skill",
    origin: "cv",
    confidence: 0.94,
    evidenceReference: "character:214-243",
    evidenceExcerpt:
      "Fictional evidence: designed event instrumentation for product journeys.",
    proficiencySignal: "advanced",
    lastUsedAt: "2026-06-30",
    confirmationState: "confirmed",
  },
  {
    id: evidenceIds[4],
    normalizedConcept: "data quality governance",
    label: "Data quality and governance",
    category: "skill",
    origin: "cv",
    confidence: 0.92,
    evidenceReference: "character:260-291",
    evidenceExcerpt:
      "Fictional evidence: ran data quality and governance reviews for tracking plans.",
    proficiencySignal: "working",
    lastUsedAt: "2026-05-31",
    confirmationState: "confirmed",
  },
  {
    id: evidenceIds[5],
    normalizedConcept: "experimentation",
    label: "Experimentation",
    category: "skill",
    origin: "cv",
    confidence: 0.9,
    evidenceReference: "character:305-324",
    evidenceExcerpt:
      "Fictional evidence: supported experimentation programmes end to end.",
    proficiencySignal: "working",
    lastUsedAt: "2026-04-30",
    confirmationState: "confirmed",
  },
] satisfies CareerEvidenceItem[];

const snapshot = deepFreeze<ProfileSnapshot>({
  generation: 0,
  dataMode: "fixtures",
  evidence: fictionalEvidence,
  uploadCapability: { enabled: false, reason: "fictional_preview" },
  currentCv: {
    id: "60000000-0000-4000-8000-000000000001",
    fileName: "fictional-career-notes.docx",
    kind: "docx",
    lifecycleStatus: "ready",
    uploadedAt: "2026-07-18T09:00:00.000Z",
  },
  draft: {
    cvDocumentId: "60000000-0000-4000-8000-000000000001",
    currentSeniority: "senior",
    targetSeniority: "lead",
    targetRoleFamilies: [
      {
        normalizedConcept: "analytics implementation consulting",
        label: "Analytics implementation consulting",
      },
    ],
    industries: [
      {
        normalizedConcept: "professional services",
        label: "Professional services",
      },
    ],
    domains: [{ normalizedConcept: "martech", label: "Marketing technology" }],
    keywords: ["measurement strategy", "data governance"],
    evidence: fictionalEvidence,
  },
  suggestions: [
    {
      id: "62000000-0000-4000-8000-000000000001",
      kind: "role_family",
      normalizedConcept: "analytics implementation consulting",
      label: "Analytics implementation consulting",
      confidence: 0.82,
      evidenceItemIds: [evidenceIds[0], evidenceIds[1]],
      state: "proposed",
      proposedAt: "2026-07-18T09:00:04.000Z",
    },
    {
      id: "62000000-0000-4000-8000-000000000002",
      kind: "skill",
      normalizedConcept: "measurement strategy",
      label: "Measurement strategy",
      confidence: 0.88,
      evidenceItemIds: [evidenceIds[0]],
      state: "accepted",
      proposedAt: "2026-07-18T09:00:05.000Z",
    },
    {
      id: "62000000-0000-4000-8000-000000000003",
      kind: "career_pathway",
      normalizedConcept: "data science",
      label: "Data science",
      confidence: 0.61,
      evidenceItemIds: [evidenceIds[2]],
      state: "rejected",
      proposedAt: "2026-07-18T09:00:06.000Z",
    },
  ],
  searches: [
    {
      id: "63000000-0000-4000-8000-000000000001",
      name: "Implementation leadership",
      enabled: true,
      roleFamilies: [
        {
          normalizedConcept: "analytics implementation consulting",
          label: "Analytics implementation consulting",
        },
      ],
      includeTerms: ["implementation", "measurement"],
      excludeTerms: [],
      industries: [],
      domains: [
        { normalizedConcept: "martech", label: "Marketing technology" },
      ],
      skillConcepts: ["stakeholder management", "sql"],
      responsibilityConcepts: ["analytics implementation"],
      currentSeniority: "senior",
      targetSeniority: "lead",
      employmentTypes: ["permanent", "contract"],
      workingTimes: ["full_time", "part_time"],
      workplaceTypes: ["hybrid", "remote"],
      ukLocations: [
        "London",
        "Manchester",
        "Edinburgh",
        "Remote within the United Kingdom",
      ],
      ir35Statuses: ["inside", "outside", "not_applicable", "unknown"],
      compensation: {
        minimum: null,
        maximum: null,
        period: "unknown",
        allowUnknown: true,
      },
      recencyDays: 14,
      notificationsEnabled: false,
    },
  ],
});

function readOnly(): Promise<never> {
  return Promise.reject(new ProfileRepositoryError("read_only"));
}

export function createDevelopmentProfileRepository(): ProfileRepository {
  return {
    uploadCapability: snapshot.uploadCapability,
    async getSnapshot() {
      return snapshot;
    },
    saveDraft: readOnly,
    acceptEvidence: readOnly,
    rejectEvidence: readOnly,
    acceptSuggestion: readOnly,
    rejectSuggestion: readOnly,
    saveSearch: readOnly,
    deleteCv: readOnly,
    deleteProfileData: readOnly,
  };
}

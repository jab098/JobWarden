import { CvFileValidationError, cvFileLimits } from "./file-gate.ts";

export const deterministicProposalVersion = "deterministic-v1" as const;

export interface ProposedCareerEvidence {
  normalizedConcept: string;
  label: string;
  category: "skill" | "tool" | "responsibility" | "domain";
  confidence: number;
  evidenceReference: `character:${number}-${number}`;
  evidenceExcerpt: string;
  matchedText: string;
  proficiencySignal: "demonstrated";
  confirmationState: "proposed";
}

export interface DeterministicProfileSuggestion {
  kind: "role_family";
  normalizedConcept: string;
  label: string;
  confidence: number;
  evidenceReferences: string[];
  state: "proposed";
}

export interface ProfileProposal {
  version: typeof deterministicProposalVersion;
  inputCharacterCount: number;
  evidence: ProposedCareerEvidence[];
  suggestions: DeterministicProfileSuggestion[];
}

interface EvidenceRule {
  normalizedConcept: string;
  label: string;
  category: ProposedCareerEvidence["category"];
  pattern: RegExp;
  confidence: number;
}

const evidenceRules: readonly EvidenceRule[] = [
  {
    normalizedConcept: "analytics implementation",
    label: "Analytics implementation",
    category: "responsibility",
    pattern: /\banalytics implementation\b/iu,
    confidence: 0.96,
  },
  {
    normalizedConcept: "implementation consulting",
    label: "Implementation consulting",
    category: "responsibility",
    pattern: /\bimplementation consult(?:ing|ant|ancy)\b/iu,
    confidence: 0.92,
  },
  {
    normalizedConcept: "stakeholder management",
    label: "Stakeholder management",
    category: "skill",
    pattern: /\bstakeholder management\b/iu,
    confidence: 0.96,
  },
  {
    normalizedConcept: "requirements gathering",
    label: "Requirements gathering",
    category: "responsibility",
    pattern: /\brequirements? (?:gathering|elicitation)\b/iu,
    confidence: 0.94,
  },
  {
    normalizedConcept: "project delivery",
    label: "Project delivery",
    category: "responsibility",
    pattern: /\bproject delivery\b/iu,
    confidence: 0.94,
  },
  {
    normalizedConcept: "data governance",
    label: "Data governance",
    category: "skill",
    pattern: /\bdata governance\b/iu,
    confidence: 0.96,
  },
  {
    normalizedConcept: "consent management",
    label: "Consent management",
    category: "skill",
    pattern: /\bconsent management\b/iu,
    confidence: 0.96,
  },
  {
    normalizedConcept: "tag management",
    label: "Tag management",
    category: "skill",
    pattern: /\btag management\b/iu,
    confidence: 0.96,
  },
  {
    normalizedConcept: "business intelligence",
    label: "Business intelligence",
    category: "skill",
    pattern: /\bbusiness intelligence\b/iu,
    confidence: 0.96,
  },
  {
    normalizedConcept: "martech",
    label: "Marketing technology",
    category: "domain",
    pattern: /\b(?:martech|marketing technology)\b/iu,
    confidence: 0.94,
  },
  {
    normalizedConcept: "power bi",
    label: "Power BI",
    category: "tool",
    pattern: /\bpower bi\b/iu,
    confidence: 0.99,
  },
  {
    normalizedConcept: "tableau",
    label: "Tableau",
    category: "tool",
    pattern: /\btableau\b/iu,
    confidence: 0.99,
  },
  {
    normalizedConcept: "looker",
    label: "Looker",
    category: "tool",
    pattern: /\blooker\b/iu,
    confidence: 0.99,
  },
  {
    normalizedConcept: "tealium",
    label: "Tealium",
    category: "tool",
    pattern: /\btealium(?: iq)?\b/iu,
    confidence: 0.99,
  },
  {
    normalizedConcept: "adobe analytics",
    label: "Adobe Analytics",
    category: "tool",
    pattern: /\badobe analytics\b/iu,
    confidence: 0.99,
  },
  {
    normalizedConcept: "google analytics",
    label: "Google Analytics",
    category: "tool",
    pattern: /\bgoogle analytics(?: 4| ga4)?\b/iu,
    confidence: 0.99,
  },
  {
    normalizedConcept: "sql",
    label: "SQL",
    category: "tool",
    pattern: /\bsql\b/iu,
    confidence: 0.99,
  },
] as const;

const emailPattern = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/giu;
const phonePattern = /\b(?:\+?44\s?|0)7[\d\s()-]{8,}\b/gu;

function safeExcerpt(text: string, start: number, end: number): string {
  const excerptStart = Math.max(0, start - 100);
  const excerptEnd = Math.min(text.length, end + 100);
  return text
    .slice(excerptStart, excerptEnd)
    .replace(emailPattern, "[redacted-email]")
    .replace(phonePattern, "[redacted-phone]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 280);
}

function createSuggestions(
  evidence: ProposedCareerEvidence[],
): DeterministicProfileSuggestion[] {
  const evidenceByConcept = new Map(
    evidence.map((item) => [item.normalizedConcept, item]),
  );
  const analyticsImplementation = evidenceByConcept.get(
    "analytics implementation",
  );
  const stakeholderManagement = evidenceByConcept.get("stakeholder management");

  if (analyticsImplementation && stakeholderManagement) {
    return [
      {
        kind: "role_family",
        normalizedConcept: "analytics implementation consulting",
        label: "Analytics implementation consulting",
        confidence: 0.82,
        evidenceReferences: [
          analyticsImplementation.evidenceReference,
          stakeholderManagement.evidenceReference,
        ],
        state: "proposed",
      },
    ];
  }

  return [];
}

export function createDeterministicProfileProposal(
  text: string,
): ProfileProposal {
  if (
    text.trim().length === 0 ||
    text.length > cvFileLimits.extractedCharacters
  ) {
    throw new CvFileValidationError("invalid_file");
  }

  const evidence = evidenceRules
    .flatMap((rule) => {
      const match = rule.pattern.exec(text);
      if (!match || match.index < 0) return [];

      const start = match.index;
      const end = start + match[0].length;
      return [
        {
          normalizedConcept: rule.normalizedConcept,
          label: rule.label,
          category: rule.category,
          confidence: rule.confidence,
          evidenceReference: `character:${start}-${end}` as const,
          evidenceExcerpt: safeExcerpt(text, start, end),
          matchedText: match[0],
          proficiencySignal: "demonstrated" as const,
          confirmationState: "proposed" as const,
          start,
        },
      ];
    })
    .sort((left, right) => left.start - right.start)
    .map(({ start: _start, ...item }) => item);

  return {
    version: deterministicProposalVersion,
    inputCharacterCount: text.length,
    evidence,
    suggestions: createSuggestions(evidence),
  };
}

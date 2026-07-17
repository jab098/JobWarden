export type UkEligibilityReason =
  "explicit_uk_location" | "explicit_uk_remote" | "non_uk" | "ambiguous";

export type UkEligibilityResult = {
  eligible: boolean;
  evidence: string[];
  reason: UkEligibilityReason;
};

const ukLocationPatterns = [
  /\bNorthern Ireland\b/i,
  /\bUnited Kingdom\b/i,
  /\bYorkshire and the Humber\b/i,
  /\bEast of England\b/i,
  /\b(?:England|Scotland|Wales)\b/i,
  /\b(?:East Midlands|West Midlands)\b/i,
  /\b(?:North East|North West|South East|South West)\b/i,
  /\bLondon\b/i,
  /\bUK\b/i,
] as const;

const remoteUkPatterns = [
  /\b(?:work(?:ing)?\s+)?remote(?:ly)?\s+(?:from|within|anywhere\s+in|across)\s+(?:the\s+)?(?:United Kingdom|UK)\b/i,
  /\b(?:United Kingdom|UK)[ -]wide\s+remote\b/i,
  /\b(?:United Kingdom|UK)[ -](?:based[ -])?remote\b/i,
  /\bremote(?:ly)?\s+(?:role\s+)?(?:open|available)\s+to\s+(?:candidates|people|workers)\s+in\s+(?:the\s+)?(?:United Kingdom|UK)\b/i,
] as const;

const explicitDescriptionLocationPatterns = ukLocationPatterns.flatMap(
  (locationPattern) => {
    const source = locationPattern.source;
    return [
      new RegExp(
        `\\b(?:based|located|working|work|office|role)\\s+(?:in|from)\\s+(?:the\\s+)?${source}`,
        "i",
      ),
      new RegExp(`${source}[- ]based\\b`, "i"),
    ];
  },
);

const nonUkPatterns = [
  /\b(?:New York|United States|USA|US applicants? only)\b/i,
  /\b(?:Ukraine|New England)\b/i,
  /\bremote(?:ly)?\s+(?:from|within|anywhere\s+in|across)\s+(?:the\s+)?Europe\b/i,
] as const;

const timeZoneReference =
  /\b(?:Europe|European|United Kingdom|UK)(?:\s+or\s+(?:Europe|European|United Kingdom|UK))*\s+time(?:\s+zones?)?\b/i;

function findMatch(value: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[0];
  }

  return null;
}

export function classifyUkEligibility(
  location: string,
  description: string,
): UkEligibilityResult {
  const remoteEvidence = findMatch(description, remoteUkPatterns);
  if (remoteEvidence) {
    return {
      eligible: true,
      evidence: [`Description: ${remoteEvidence}`],
      reason: "explicit_uk_remote",
    };
  }

  if (findMatch(location, [/\b(?:Ukraine|New England)\b/i])) {
    return { eligible: false, evidence: [], reason: "non_uk" };
  }

  if (!timeZoneReference.test(location)) {
    const locationEvidence = findMatch(location, ukLocationPatterns);
    if (locationEvidence) {
      return {
        eligible: true,
        evidence: [`Location: ${locationEvidence}`],
        reason: "explicit_uk_location",
      };
    }
  }

  const descriptionEvidence = findMatch(
    description,
    explicitDescriptionLocationPatterns,
  );
  if (descriptionEvidence && !timeZoneReference.test(descriptionEvidence)) {
    return {
      eligible: true,
      evidence: [`Description: ${descriptionEvidence}`],
      reason: "explicit_uk_location",
    };
  }

  if (
    findMatch(location, nonUkPatterns) ||
    findMatch(description, nonUkPatterns)
  ) {
    return { eligible: false, evidence: [], reason: "non_uk" };
  }

  return { eligible: false, evidence: [], reason: "ambiguous" };
}

export type EmploymentType =
  | "permanent"
  | "fixed_term"
  | "contract"
  | "temporary"
  | "apprenticeship"
  | "internship"
  | "casual"
  | "zero_hours"
  | "unknown";

const employmentRules: readonly [RegExp, EmploymentType][] = [
  [/\bzero[-\s]hours?\b/i, "zero_hours"],
  [/\bfixed[-\s]term\b/i, "fixed_term"],
  [/\bapprentice(?:ship)?\b/i, "apprenticeship"],
  [/\bintern(?:ship)?\b/i, "internship"],
  [/\btemporary\b/i, "temporary"],
  [/\bcasual\b/i, "casual"],
  [/\bpermanent\b/i, "permanent"],
  [/\bcontract(?:or|ing)?\b/i, "contract"],
];

export function classifyEmployment(description: string): EmploymentType {
  for (const [pattern, employmentType] of employmentRules) {
    if (pattern.test(description)) return employmentType;
  }

  return "unknown";
}

export type ClassifiedIr35Status = "inside" | "outside" | "unknown";

export function classifyIr35(description: string): ClassifiedIr35Status {
  if (/\binside\s+IR35\b/i.test(description)) return "inside";
  if (/\boutside\s+IR35\b/i.test(description)) return "outside";
  return "unknown";
}

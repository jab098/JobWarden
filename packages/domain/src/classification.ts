import type { EmploymentType } from "./job";

export type UkEligibilityReason =
  "explicit_uk_location" | "explicit_uk_remote" | "non_uk" | "ambiguous";

export type UkEligibilityResult = {
  eligible: boolean;
  evidence: string[];
  reason: UkEligibilityReason;
};

const ukNationAnchors = new Set([
  "uk",
  "united kingdom",
  "england",
  "scotland",
  "wales",
  "northern ireland",
]);

const ukOfficialRegions = new Set([
  "east midlands",
  "east of england",
  "london",
  "north east",
  "north west",
  "south east",
  "south west",
  "west midlands",
  "yorkshire and the humber",
]);

const knownUkCities = new Set([
  "aberdeen",
  "belfast",
  "birmingham",
  "brighton",
  "bristol",
  "cambridge",
  "cardiff",
  "coventry",
  "derry",
  "dundee",
  "edinburgh",
  "glasgow",
  "leeds",
  "leicester",
  "liverpool",
  "londonderry",
  "manchester",
  "newcastle",
  "newcastle upon tyne",
  "newport",
  "nottingham",
  "oxford",
  "portsmouth",
  "sheffield",
  "southampton",
  "swansea",
  "york",
]);

const nonLocationLabels = new Set([
  "hybrid",
  "office based",
  "on site",
  "onsite",
  "remote",
  "remote role",
]);

const ukDescriptionAnchor =
  /\b(?:United Kingdom|UK|Northern Ireland|Scotland|Wales|England)\b/i;
const eligibilityLanguage =
  /\b(?:applicants?|based|candidates?|eligible|ineligible|located|remote(?:ly)?|residents?|work(?:ers?|ing)?)\b/i;
const strongEligibilityLanguage =
  /\b(?:applicants?|based|candidates?|eligible|ineligible|located|remote(?:ly)?|residents?|workers?)\b/i;
const negationOrExclusion =
  /\b(?:not|cannot|can't|must\s+not|unable|ineligible|excluding|except)\b/i;
const timeZoneReference =
  /\b(?:Europe|European|United Kingdom|UK)(?:\s+or\s+(?:Europe|European|United Kingdom|UK))*\s+time(?:\s+zones?)?\b/i;
const explicitForeignEligibility =
  /\b(?:remote(?:ly)?\s+(?:from|within|anywhere\s+in|across)|\S+\s+applicants?\s+only)\b/i;

type LocationAssessment =
  | { outcome: "eligible"; evidence: string }
  | { outcome: "non_uk" }
  | { outcome: "ambiguous" };

type DescriptionAssessment =
  | { outcome: "eligible"; evidence: string; reason: UkEligibilityReason }
  | { outcome: "non_uk"; evidence: string[] }
  | { outcome: "ambiguous" };

function normaliseLocationLabel(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB");
}

function splitLocation(location: string): string[] {
  return location
    .replace(/\(([^()]*)\)/g, ",$1,")
    .replace(/\s+[–—-]\s+/g, ",")
    .split(",")
    .map(normaliseLocationLabel)
    .filter(Boolean);
}

function isQualifiedUkLabel(label: string): boolean {
  return (
    ukNationAnchors.has(label) ||
    ukOfficialRegions.has(label) ||
    knownUkCities.has(label)
  );
}

function assessLocation(location: string): LocationAssessment {
  const labels = splitLocation(location);
  if (
    labels.length === 0 ||
    labels.every((label) => nonLocationLabels.has(label))
  ) {
    return { outcome: "ambiguous" };
  }

  const hasUkEvidence = labels.some(isQualifiedUkLabel);
  const hasContradictoryQualifier = labels.some(
    (label) => !isQualifiedUkLabel(label) && !nonLocationLabels.has(label),
  );

  if (hasUkEvidence && !hasContradictoryQualifier) {
    return {
      outcome: "eligible",
      evidence: `Location: ${location.trim()}`,
    };
  }

  return { outcome: "non_uk" };
}

function clausesFrom(description: string): string[] {
  return description
    .split(/[.!?;\r\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function hasExplicitUkAnchor(clause: string): boolean {
  return ukDescriptionAnchor.test(clause.replace(/\bNew England\b/gi, ""));
}

function negativeEvidenceFor(clause: string): string {
  const genericRolePrefix = clause.match(/^This role is\s+(.+)$/i);
  return genericRolePrefix?.[1] ?? clause;
}

function boundDescriptionEvidence(evidence: string): string {
  const maximumContentLength = 500 - "Description: ".length;
  if (evidence.length <= maximumContentLength) return evidence;
  return `${evidence.slice(0, maximumContentLength - 1).trimEnd()}…`;
}

function assessDescription(description: string): DescriptionAssessment {
  let positive: { evidence: string; reason: UkEligibilityReason } | undefined;
  let negativeEvidence: string | undefined;
  let hasForeignEligibility = false;

  for (const clause of clausesFrom(description)) {
    const hasUkAnchor = hasExplicitUkAnchor(clause);
    const hasEligibilityLanguage = eligibilityLanguage.test(clause);
    const isTimeZoneOnly =
      timeZoneReference.test(clause) && !strongEligibilityLanguage.test(clause);

    if (hasUkAnchor && hasEligibilityLanguage && !isTimeZoneOnly) {
      if (negationOrExclusion.test(clause)) {
        negativeEvidence ??= boundDescriptionEvidence(
          negativeEvidenceFor(clause),
        );
      } else {
        positive ??= {
          evidence: boundDescriptionEvidence(clause),
          reason:
            /\b(?:remote(?:ly)?|applicants?|candidates?|residents?)\b/i.test(
              clause,
            )
              ? "explicit_uk_remote"
              : "explicit_uk_location",
        };
      }
      continue;
    }

    if (!hasUkAnchor && explicitForeignEligibility.test(clause)) {
      hasForeignEligibility = true;
    }
  }

  if (positive) return { outcome: "eligible", ...positive };
  if (negativeEvidence) {
    return {
      outcome: "non_uk",
      evidence: [`Description: ${negativeEvidence}`],
    };
  }
  if (hasForeignEligibility) return { outcome: "non_uk", evidence: [] };
  return { outcome: "ambiguous" };
}

export function classifyUkEligibility(
  location: string,
  description: string,
): UkEligibilityResult {
  const locationAssessment = assessLocation(location);
  if (locationAssessment.outcome === "non_uk") {
    return { eligible: false, evidence: [], reason: "non_uk" };
  }

  const descriptionAssessment = assessDescription(description);
  if (descriptionAssessment.outcome === "eligible") {
    return {
      eligible: true,
      evidence: [`Description: ${descriptionAssessment.evidence}`],
      reason: descriptionAssessment.reason,
    };
  }
  if (descriptionAssessment.outcome === "non_uk") {
    return {
      eligible: false,
      evidence: descriptionAssessment.evidence,
      reason: "non_uk",
    };
  }

  if (locationAssessment.outcome === "eligible") {
    return {
      eligible: true,
      evidence: [locationAssessment.evidence],
      reason: "explicit_uk_location",
    };
  }

  return { eligible: false, evidence: [], reason: "ambiguous" };
}

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

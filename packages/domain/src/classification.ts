import type { EmploymentType } from "./job.ts";

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

const ukAnchorSource = String.raw`(?:United Kingdom|UK|Northern Ireland|Scotland|Wales|England)`;
const foreignAnchorSource = String.raw`(?:Europe|EU|EEA|USA|US|United States|Canada|Australia|New Zealand|Americas|APAC|EMEA)`;
const permissionSubjectSource = String.raw`(?:applicants?|candidates?|you)`;
const applicationSource = String.raw`(?:applications?|requests?)`;
const ukApplicationTargetSource = String.raw`${ukAnchorSource}\s+(?:applicants?|candidates?|residents?|workers?)`;
const timeZoneReference =
  /\b(?:Europe|European|United Kingdom|UK)(?:\s+or\s+(?:Europe|European|United Kingdom|UK))*\s+time(?:\s+zones?)?\b/i;

const ukExclusionRules = [
  new RegExp(
    `\\bno\\s+${ukAnchorSource}\\s+(?:applicants?|candidates?|residents?)\\b`,
    "i",
  ),
  new RegExp(
    `\\b(?:do|does)\\s+not\\s+(?:accept|consider)\\s+${ukAnchorSource}\\s+(?:applicants?|candidates?|residents?)\\b`,
    "i",
  ),
  new RegExp(
    `\\b${ukAnchorSource}\\s+(?:applicants?|candidates?|residents?)\\s+(?:are\\s+|is\\s+)?(?:excluded|not\\s+eligible|ineligible|not\\s+accepted|cannot\\s+apply|can't\\s+apply)\\b`,
    "i",
  ),
  new RegExp(
    `\\b${permissionSubjectSource}\\s+(?:are\\s+not|is\\s+not|cannot|can't|must\\s+not|may\\s+not)\\s+(?:be\\s+)?(?:based|reside|resident|live|located|work|apply)(?:\\s+remotely)?\\s+(?:in|from|within)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
    "i",
  ),
  new RegExp(
    `\\b(?:the\\s+|this\\s+|our\\s+)?(?:role|position|job|vacancy)\\s+(?:is\\s+not|will\\s+not\\s+be|cannot\\s+be|can't\\s+be|must\\s+not\\s+be|may\\s+not\\s+be)\\s+(?:based|located|available|remote)\\s+(?:in|from|within)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
    "i",
  ),
  new RegExp(
    `\\b${applicationSource}\\s+from\\s+(?:the\\s+)?${ukApplicationTargetSource}\\s+(?:(?:(?:will|shall)\\s+not\\s+be|(?:are|is)\\s+not)\\s+(?:accepted|considered)|(?:are|is)\\s+(?:rejected|excluded))\\b`,
    "i",
  ),
  new RegExp(
    `\\b(?:rejects?|do(?:es)?\\s+not\\s+accept)\\s+${applicationSource}\\s+from\\s+(?:the\\s+)?${ukApplicationTargetSource}\\b`,
    "i",
  ),
] as const;

const ukEligibilityRules: readonly {
  pattern: RegExp;
  reason: Extract<
    UkEligibilityReason,
    "explicit_uk_location" | "explicit_uk_remote"
  >;
}[] = [
  {
    pattern: new RegExp(
      `\\b(?:the\\s+|this\\s+|our\\s+)?(?:role|position|job|vacancy)\\s+(?:(?:is|will\\s+be|can\\s+be|may\\s+be|must\\s+be)\\s+)?(?:based|located)\\s+(?:in|within)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
      "i",
    ),
    reason: "explicit_uk_location",
  },
  {
    pattern: new RegExp(
      `\\b${ukAnchorSource}[- ]based\\s+(?:role|position|job|vacancy)\\b`,
      "i",
    ),
    reason: "explicit_uk_location",
  },
  {
    pattern: new RegExp(
      `\\b${permissionSubjectSource}\\s+(?:(?:are|is|must\\s+be|can\\s+be|may\\s+be|need\\s+to\\s+be|should\\s+be)\\s+)?(?:based|resident|located)\\s+(?:in|within|from)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
  {
    pattern: new RegExp(
      `\\b${permissionSubjectSource}\\s+(?:(?:are|must\\s+be|can\\s+be|need\\s+to\\s+be|should\\s+be)\\s+)?eligible\\s+to\\s+work\\s+(?:in|from|within)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
  {
    pattern: new RegExp(
      `\\b${ukAnchorSource}\\s+(?:applicants?|candidates?|residents?|workers?)\\s+only\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
  {
    pattern: new RegExp(
      `\\b(?:open|available)\\s+to\\s+(?:applicants?|candidates?|residents?)\\s+(?:in|from|within)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
  {
    pattern: new RegExp(
      `\\b(?:open|available)\\s+to\\s+(?:the\\s+)?${ukAnchorSource}\\s+(?:applicants?|candidates?|residents?)\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
  {
    pattern: new RegExp(
      `\\b${ukAnchorSource}[- ]wide\\s+remote(?:\\s+(?:role|position|job|vacancy))?\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
  {
    pattern: new RegExp(
      `\\b(?:remote(?:ly)?|work(?:ing)?(?:\\s+remotely)?)\\s+(?:in|from|within|across|anywhere\\s+in)\\s+(?:the\\s+)?${ukAnchorSource}\\b`,
      "i",
    ),
    reason: "explicit_uk_remote",
  },
];

const foreignEligibilityRules = [
  new RegExp(
    `\\b(?:remote(?:ly)?|work(?:ing)?(?:\\s+remotely)?)\\s+(?:in|from|within|across|anywhere\\s+in)\\s+(?:the\\s+)?${foreignAnchorSource}\\b`,
    "i",
  ),
  new RegExp(
    `\\b${foreignAnchorSource}\\s+(?:applicants?|candidates?|residents?)\\s+only\\b`,
    "i",
  ),
] as const;

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
      evidence: formatEvidence("Location", location.trim()),
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

function negativeEvidenceFor(clause: string): string {
  const genericRolePrefix = clause.match(/^This role is\s+(.+)$/i);
  return genericRolePrefix?.[1] ?? clause;
}

function formatEvidence(
  source: "Description" | "Location",
  value: string,
): string {
  const prefix = `${source}: `;
  const maximumContentLength = 500 - prefix.length;
  if (value.length <= maximumContentLength) return `${prefix}${value}`;
  return `${prefix}${value.slice(0, maximumContentLength - 1).trimEnd()}…`;
}

function assessDescription(description: string): DescriptionAssessment {
  let positive: { evidence: string; reason: UkEligibilityReason } | undefined;
  let negativeEvidence: string | undefined;
  let hasForeignEligibility = false;

  for (const clause of clausesFrom(description)) {
    if (ukExclusionRules.some((pattern) => pattern.test(clause))) {
      negativeEvidence ??= negativeEvidenceFor(clause);
    }

    if (timeZoneReference.test(clause)) continue;

    const eligibilityRule = ukEligibilityRules.find(({ pattern }) =>
      pattern.test(clause),
    );
    if (eligibilityRule) {
      positive ??= {
        evidence: clause,
        reason: eligibilityRule.reason,
      };
    }

    if (foreignEligibilityRules.some((pattern) => pattern.test(clause))) {
      hasForeignEligibility = true;
    }
  }

  if (negativeEvidence) {
    return {
      outcome: "non_uk",
      evidence: [formatEvidence("Description", negativeEvidence)],
    };
  }
  if (positive) return { outcome: "eligible", ...positive };
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
      evidence: [formatEvidence("Description", descriptionAssessment.evidence)],
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

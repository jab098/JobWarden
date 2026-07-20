import type { EmploymentType } from "./job.ts";
import { isUkAdministrativeArea, isUkPlaceName } from "./uk-places.ts";

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

/**
 * The remainder of a 27-city allowlist the gazetteer has otherwise absorbed.
 *
 * These two are the only ones it does not carry under the name an advert would
 * use: it spells them Londonderry and Newcastle upon Tyne. The other 25 were
 * removed rather than left to drift out of step with the dataset.
 */
const knownUkCities = new Set(["derry", "newcastle"]);

const nonLocationLabels = new Set([
  "hybrid",
  "office based",
  "on site",
  "onsite",
  "remote",
  "remote role",
]);

/**
 * Ceremonial and historic counties the gazetteer does not carry.
 *
 * The bundled dataset records the *unitary authority* a place sits in — Leeds's
 * county is "Leeds" — but adverts are written with the ceremonial county, so
 * "Leeds, West Yorkshire" needs this list and the dataset cannot supply it.
 * Only the 47 the dataset lacks are here; `isUkAdministrativeArea` covers the
 * other 47 already.
 */
const ukCeremonialCounties = new Set([
  "west yorkshire",
  "south yorkshire",
  "east yorkshire",
  "east riding of yorkshire",
  "greater manchester",
  "merseyside",
  "tyne and wear",
  "cheshire",
  "cumbria",
  "northumberland",
  "rutland",
  "herefordshire",
  "northamptonshire",
  "bedfordshire",
  "berkshire",
  "sussex",
  "isle of wight",
  "middlesex",
  "avon",
  "powys",
  "dyfed",
  "clwyd",
  "gwent",
  "glamorgan",
  "south glamorgan",
  "west glamorgan",
  "mid glamorgan",
  "pembrokeshire",
  "monmouthshire",
  "flintshire",
  "anglesey",
  "isle of anglesey",
  "aberdeenshire",
  "angus",
  "argyll and bute",
  "ayrshire",
  "lanarkshire",
  "midlothian",
  "east lothian",
  "perthshire",
  "stirlingshire",
  "scottish borders",
  "armagh",
  "fermanagh",
  "tyrone",
  "county fermanagh",
  "county tyrone",
]);

/**
 * Foreign countries and the first-level subdivisions of the English-speaking
 * ones.
 *
 * This list is not what keeps a foreign job out — `assessLocation` refuses to
 * publish anything carrying a label it does not positively recognise, so
 * "Bangor, ME" and "Hamilton, Bermuda" are already safe without appearing here.
 * A denylist of foreign places cannot be enumerated, and one relied upon as the
 * barrier fails open: an entry merely written with a full stop ("London, Ont.")
 * or a country nobody listed would publish.
 *
 * What it buys is precision. Naming the obvious cases returns the honest
 * `non_uk` instead of sending "London, Ontario" to a review queue.
 *
 * Because it is optional, entries are omitted rather than risked: no bare
 * abbreviation (fifteen UK postcode areas are two letters, so "Derby, DE" would
 * be discarded) and no name shared with a UK place — there is a Washington in
 * Tyne and Wear, a Boston in Lincolnshire, a Perth in Scotland and a Hamilton in
 * Lanarkshire, and none of them appear below. Every entry was checked against
 * the bundled 230-place dataset; none names a UK place.
 */
const foreignRegionAnchors = new Set([
  // United States
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
  // Canada
  "ontario",
  "quebec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "newfoundland",
  "newfoundland and labrador",
  "prince edward island",
  "yukon",
  "northwest territories",
  "nunavut",
  // Australia and New Zealand
  "new south wales",
  "queensland",
  "western australia",
  "south australia",
  "tasmania",
  "northern territory",
  "australian capital territory",
  // Victoria is deliberately absent: it names a district of London as well as an
  // Australian state, and "Brighton, Victoria" is already refused as unrecognised.
  // Countries
  "usa",
  "u s a",
  "united states",
  "united states of america",
  "america",
  "canada",
  "australia",
  "new zealand",
  "ireland",
  "republic of ireland",
  "france",
  "germany",
  "spain",
  "italy",
  "netherlands",
  "the netherlands",
  "belgium",
  "luxembourg",
  "switzerland",
  "austria",
  "poland",
  "portugal",
  "sweden",
  "norway",
  "denmark",
  "finland",
  "iceland",
  "estonia",
  "latvia",
  "lithuania",
  "czechia",
  "czech republic",
  "slovakia",
  "hungary",
  "romania",
  "bulgaria",
  "greece",
  "croatia",
  "slovenia",
  "serbia",
  "ukraine",
  "turkey",
  "russia",
  "india",
  "pakistan",
  "bangladesh",
  "china",
  "hong kong",
  "japan",
  "south korea",
  "singapore",
  "malaysia",
  "indonesia",
  "thailand",
  "vietnam",
  "philippines",
  "israel",
  "united arab emirates",
  "uae",
  "saudi arabia",
  "qatar",
  "south africa",
  "nigeria",
  "kenya",
  "egypt",
  "morocco",
  "brazil",
  "argentina",
  "chile",
  "colombia",
  "mexico",
  "peru",
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
    // Derry and Newcastle are in this allowlist but not in the gazetteer, which
    // carries Londonderry and Newcastle upon Tyne, so it still earns its place.
    knownUkCities.has(label) ||
    ukCeremonialCounties.has(label) ||
    isUkPlaceName(label) ||
    isUkAdministrativeArea(label)
  );
}

/**
 * Whether the label names a real foreign place.
 *
 * Defence in depth rather than the barrier: an unrecognised label already fails
 * to publish, so this exists to say `non_uk` where the honest answer is known,
 * instead of sending "London, Ontario" to a review queue it does not belong in.
 * It is deliberately not load-bearing, because a denylist of foreign places
 * cannot be enumerated and anything missing from it would publish.
 */
function isForeignLabel(label: string): boolean {
  return foreignRegionAnchors.has(label);
}

function assessLocation(location: string): LocationAssessment {
  const labels = splitLocation(location);
  if (
    labels.length === 0 ||
    labels.every((label) => nonLocationLabels.has(label))
  ) {
    return { outcome: "ambiguous" };
  }

  // An explicit nation outranks a homonym: Washington in Tyne and Wear is not
  // Washington State, and "Washington, England" says so. Quarantine it for a
  // human rather than spending the one outcome that cannot be recovered from.
  const namesUkNation = labels.some((label) => ukNationAnchors.has(label));
  if (!namesUkNation && labels.some(isForeignLabel)) {
    return { outcome: "non_uk" };
  }

  // Publication requires every label to be recognised, not merely one. This is
  // the barrier: "London, Ont." carries a real UK city beside a qualifier no
  // denylist happens to hold, and only an allowlist refuses it.
  const hasUnknownQualifier = labels.some(
    (label) => !isQualifiedUkLabel(label) && !nonLocationLabels.has(label),
  );
  if (labels.some(isQualifiedUkLabel) && !hasUnknownQualifier) {
    return {
      outcome: "eligible",
      evidence: formatEvidence("Location", location.trim()),
    };
  }

  // What changed is the consequence, not this test. Treating an unrecognised
  // qualifier as evidence *against* the UK excluded 95.7% of adverts written
  // "Town, County", silently, because `excluded` is dropped where `ambiguous`
  // is quarantined and reviewable.
  return { outcome: "ambiguous" };
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

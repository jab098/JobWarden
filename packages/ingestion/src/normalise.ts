import {
  classifyEmployment,
  classifyIr35,
  classifyUkEligibility,
  normalisedJobSchema,
  parseCompensation,
  type NormalisedJob,
  type UkEligibilityReason,
} from "@jobwarden/domain";
import sanitizeHtml from "sanitize-html";

import { hashNormalisedJobContent, sha256Hex } from "./hash.ts";
import type { JobSource, NormalisationResult, ProviderJob } from "./types.ts";

const nonTextTags = [
  "head",
  "title",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "canvas",
  "audio",
  "video",
  "picture",
  "datalist",
  "meter",
  "progress",
  "script",
  "style",
  "noscript",
  "template",
  "textarea",
  "option",
  "xmp",
  "noembed",
  "noframes",
] as const;
const nonTextTagSet: ReadonlySet<string> = new Set(nonTextTags);
const maximumEntityNormalisationPasses = 8;

const blockTagPattern =
  /<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

const encodedCharacters: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|nbsp|quot));/gi,
    (entity, decimal: string, hexadecimal: string, named: string) => {
      if (named) {
        const normalisedName = named.toLowerCase();
        return encodedCharacters[normalisedName] ?? entity;
      }

      const codePoint = Number.parseInt(
        decimal || hexadecimal,
        decimal ? 10 : 16,
      );
      if (
        !Number.isSafeInteger(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return "�";
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function styleHidesSubtree(style: string | undefined): boolean {
  if (!style) return false;

  const declarations = style
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .toLowerCase()
    .split(";");

  return declarations.some((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator === -1) return false;

    const property = declaration.slice(0, separator).trim();
    const value = declaration
      .slice(separator + 1)
      .replace(/\s*!important\s*$/u, "")
      .trim();

    return (
      (property === "display" && value === "none") ||
      (property === "visibility" &&
        (value === "hidden" || value === "collapse")) ||
      (property === "content-visibility" && value === "hidden")
    );
  });
}

function explicitlyHidesSubtree(
  tagName: string,
  attributes: Readonly<Record<string, string>>,
): boolean {
  return (
    Object.hasOwn(attributes, "hidden") ||
    Object.hasOwn(attributes, "inert") ||
    Object.hasOwn(attributes, "popover") ||
    (tagName === "dialog" && !Object.hasOwn(attributes, "open")) ||
    attributes["aria-hidden"]?.trim().toLowerCase() === "true" ||
    styleHidesSubtree(attributes.style)
  );
}

function sanitiseMarkup(value: string): string {
  type VisibilityFrame = {
    tagName: string;
    suppressSubtree: boolean;
    closedDetails: boolean;
    hasSummary: boolean;
  };

  const visibilityStack: VisibilityFrame[] = [];
  const withBlockBoundaries = value.replace(blockTagPattern, " $& ");
  return sanitizeHtml(withBlockBoundaries, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: [...nonTextTags],
    parser: { decodeEntities: true },
    onOpenTag: (tagName: string, attributes: Record<string, string>) => {
      const parent = visibilityStack.at(-1);
      let suppressSubtree = parent?.suppressSubtree ?? false;

      if (parent?.closedDetails) {
        if (tagName === "summary" && !parent.hasSummary) {
          parent.hasSummary = true;
        } else {
          suppressSubtree = true;
        }
      }

      suppressSubtree ||=
        nonTextTagSet.has(tagName) ||
        explicitlyHidesSubtree(tagName, attributes);

      visibilityStack.push({
        tagName,
        suppressSubtree,
        closedDetails:
          !suppressSubtree &&
          tagName === "details" &&
          !Object.hasOwn(attributes, "open"),
        hasSummary: false,
      });
    },
    onCloseTag: (tagName: string) => {
      const matchingIndex = visibilityStack.findLastIndex(
        (frame) => frame.tagName === tagName,
      );
      if (matchingIndex >= 0) visibilityStack.length = matchingIndex;
    },
    textFilter: (text: string) =>
      visibilityStack.at(-1)?.closedDetails ? "" : text,
    transformTags: {
      "*": (tagName: string, attributes: Record<string, string>) =>
        visibilityStack.at(-1)?.suppressSubtree
          ? { tagName: "template", attribs: {} }
          : { tagName, attribs: attributes },
    },
  });
}

export function htmlToPlainText(html: string): string {
  let sanitisedText = sanitiseMarkup(decodeEntities(html));

  for (let pass = 0; pass < maximumEntityNormalisationPasses; pass += 1) {
    const decodedText = decodeEntities(sanitisedText);
    const resanitisedText = sanitiseMarkup(decodedText);

    if (decodeEntities(resanitisedText) === decodedText) {
      return decodedText.replace(/\s+/gu, " ").trim();
    }

    sanitisedText = resanitisedText;
  }

  return "";
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function allowedHostname(value: string): string | null {
  const normalised = value.trim().toLowerCase().replace(/\.+$/, "");
  if (!normalised || /[:/@?#\\]/.test(normalised)) return null;

  try {
    const parsed = new URL(`https://${normalised}`);
    if (parsed.hostname !== normalised || parsed.pathname !== "/") return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

function validatedApplicationUrl(
  absoluteUrl: string,
  allowedHosts: readonly string[],
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(absoluteUrl);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  const allowed = allowedHosts
    .map(allowedHostname)
    .filter((host): host is string => host !== null);
  if (
    !allowed.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  ) {
    return null;
  }

  return parsed.toString();
}

function classifyWorkingTime(text: string): NormalisedJob["workingTime"] {
  if (/\bpart[-\s]?time\b/i.test(text)) return "part_time";
  if (/\bfull[-\s]?time\b/i.test(text)) return "full_time";
  if (/\bflexible\s+(?:hours|working|schedule)\b/i.test(text)) {
    return "flexible";
  }
  return "unknown";
}

function classifyWorkplace(
  location: string,
  text: string,
): NormalisedJob["workplaceType"] {
  const evidence = `${location} ${text}`;
  if (/\bhybrid\b/i.test(evidence)) return "hybrid";
  if (/\bremote(?:ly)?\b/i.test(evidence)) return "remote";
  if (/\b(?:on[-\s]?site|office[-\s]?based)\b/i.test(evidence)) {
    return "onsite";
  }
  return "unknown";
}

/**
 * Whether the advert permits remote work from within the UK.
 *
 * This is deliberately not a rename of the workplace type. "Remote" says how
 * the work is done, not where the worker may live, and AGENTS.md forbids
 * publishing remote work without explicit UK permission — so the question is
 * which evidence the eligibility check actually found, not whether it found
 * any.
 *
 * `explicit_uk_remote` is remote-permission language in the advert itself.
 * `explicit_uk_location` is an office address, which is ample for an onsite or
 * hybrid role and says nothing at all about who may work remotely. An earlier
 * version took a `hasUkEvidence` boolean, which is always true this far into
 * normalisation because every ineligible job has already returned — so the
 * cautious branch was unreachable and a London-office advert saying "fully
 * remote" was stamped as UK-permitted on the strength of the office address.
 */
function classifyRemoteEligibility(
  workplaceType: NormalisedJob["workplaceType"],
  reason: UkEligibilityReason,
): NormalisedJob["remoteEligibility"] {
  if (workplaceType === "onsite" || workplaceType === "hybrid") {
    return "not_remote";
  }
  if (workplaceType === "remote") {
    return reason === "explicit_uk_remote" ? "uk" : "ambiguous";
  }
  return "unknown";
}

function compensationEvidence(
  descriptionText: string,
  metadataText: readonly string[],
): string | null {
  const descriptionClauses = descriptionText.split(/(?<=[.!?;])\s+/u);
  const candidate = [...metadataText, ...descriptionClauses].find((value) =>
    /(?:£|\bGBP\b)/i.test(value),
  );
  if (!candidate) return null;

  return candidate.slice(0, 1_000).trimEnd();
}

function toMinorUnits(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  const minorUnits = Math.round(value * 100);
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

function canonicalDeduplicationUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return null;
  }

  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.toString();
}

async function deduplicationKey(
  source: JobSource,
  providerJob: ProviderJob,
): Promise<string> {
  const canonicalUrl = providerJob.canonicalApplicationUrl
    ? canonicalDeduplicationUrl(providerJob.canonicalApplicationUrl)
    : null;

  return sha256Hex(
    canonicalUrl ??
      `${source.provider}\u0000${source.id}\u0000${providerJob.providerJobId}`,
  );
}

export async function normaliseProviderJob(
  source: JobSource,
  providerJob: ProviderJob,
): Promise<NormalisationResult> {
  const applicationUrl = validatedApplicationUrl(
    providerJob.absoluteUrl,
    source.allowedHosts,
  );
  if (!applicationUrl) {
    return {
      outcome: "quarantined",
      reason: "invalid_application_url",
      providerJobId: providerJob.providerJobId,
    };
  }

  const titleText = htmlToPlainText(providerJob.title);
  const locationText = htmlToPlainText(providerJob.location);
  const descriptionText = htmlToPlainText(providerJob.descriptionHtml);
  const metadataText = providerJob.metadataText
    .map(htmlToPlainText)
    .filter(Boolean)
    .sort(compareText);
  const classificationText = [titleText, descriptionText, ...metadataText].join(
    " ",
  );
  const ukEligibility = classifyUkEligibility(locationText, classificationText);

  if (!ukEligibility.eligible) {
    return ukEligibility.reason === "non_uk"
      ? {
          outcome: "excluded",
          reason: "non_uk",
          providerJobId: providerJob.providerJobId,
        }
      : {
          outcome: "quarantined",
          reason: "ambiguous_uk_eligibility",
          providerJobId: providerJob.providerJobId,
          locationText,
        };
  }

  const inferredCompensationRaw = compensationEvidence(
    descriptionText,
    metadataText,
  );
  const inferredCompensation = parseCompensation(inferredCompensationRaw ?? "");
  const structuredCompensation = providerJob.compensation;
  const structuredMinimum = structuredCompensation
    ? toMinorUnits(structuredCompensation.minimum)
    : null;
  const structuredMaximum = structuredCompensation
    ? toMinorUnits(structuredCompensation.maximum)
    : null;
  const hasStructuredCompensation =
    structuredCompensation?.currency === "GBP" &&
    (structuredMinimum !== null || structuredMaximum !== null);
  const compensationRaw = hasStructuredCompensation
    ? structuredCompensation.raw
    : inferredCompensationRaw;
  const compensationMinimum = hasStructuredCompensation
    ? structuredMinimum
    : inferredCompensation.minimum;
  const compensationMaximum = hasStructuredCompensation
    ? structuredMaximum
    : inferredCompensation.maximum;
  const compensationCurrency = hasStructuredCompensation
    ? structuredCompensation.currency
    : inferredCompensation.currency;
  const compensationPeriod = hasStructuredCompensation
    ? structuredCompensation.period
    : inferredCompensation.period;
  const hasAdvertisedCompensation =
    compensationCurrency === "GBP" &&
    (compensationMinimum !== null || compensationMaximum !== null);
  const workplaceType = classifyWorkplace(locationText, classificationText);
  const content: Omit<NormalisedJob, "contentHash"> = {
    sourceId: source.id,
    providerJobId: providerJob.providerJobId,
    title: titleText,
    employer: htmlToPlainText(
      providerJob.employerName?.trim() || source.employerName,
    ),
    descriptionText,
    applicationUrl,
    countryCode: "GB",
    // The advert's own location words, never invented. An advert that states no
    // location still needs a row, because the location table is what both text
    // and distance search read, so a stated absence is recorded as such rather
    // than dropped.
    rawLocation:
      locationText.trim().slice(0, 1_000) || "UK location not specified",
    remoteEligibility: classifyRemoteEligibility(
      workplaceType,
      ukEligibility.reason,
    ),
    ukEligibilityEvidence: ukEligibility.evidence,
    employmentType:
      providerJob.employmentType ?? classifyEmployment(classificationText),
    workingTime:
      providerJob.workingTime ?? classifyWorkingTime(classificationText),
    workplaceType,
    ir35Status: classifyIr35(classificationText),
    compensationRaw,
    compensationMinimum,
    compensationMaximum,
    compensationCurrency,
    compensationPeriod,
    compensationProvenance:
      hasStructuredCompensation && structuredCompensation
        ? structuredCompensation.provenance
        : hasAdvertisedCompensation
          ? "advertised"
          : "unknown",
    compensationObservedAt:
      hasStructuredCompensation && structuredCompensation
        ? structuredCompensation.observedAt
        : hasAdvertisedCompensation
          ? (providerJob.updatedAt ?? providerJob.postedAt ?? null)
          : null,
    postedAt: providerJob.postedAt ?? null,
    closesAt: providerJob.closesAt ?? null,
    deduplicationKey: await deduplicationKey(source, providerJob),
  };
  const contentHash = await hashNormalisedJobContent(content);

  return {
    outcome: "eligible",
    job: normalisedJobSchema.parse({ ...content, contentHash }),
  };
}

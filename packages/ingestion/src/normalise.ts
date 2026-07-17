import {
  classifyEmployment,
  classifyIr35,
  classifyUkEligibility,
  normalisedJobSchema,
  parseCompensation,
  type NormalisedJob,
} from "@jobwarden/domain";
import sanitizeHtml from "sanitize-html";

import { hashNormalisedJobContent } from "./hash";
import type { JobSource, NormalisationResult, ProviderJob } from "./types";

const nonTextTags = [
  "script",
  "style",
  "noscript",
  "template",
  "textarea",
  "option",
] as const;

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

function decodeSanitizerEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|nbsp|quot));/gi,
    (entity, decimal: string, hexadecimal: string, named: string) => {
      if (named) return encodedCharacters[named.toLowerCase()] ?? entity;

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

export function htmlToPlainText(html: string): string {
  const withBlockBoundaries = html.replace(blockTagPattern, " $& ");
  const text = sanitizeHtml(withBlockBoundaries, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: [...nonTextTags],
    parser: { decodeEntities: true },
  });

  return decodeSanitizerEntities(text).replace(/\s+/gu, " ").trim();
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

  const descriptionText = htmlToPlainText(providerJob.descriptionHtml);
  const metadataText = providerJob.metadataText
    .map(htmlToPlainText)
    .filter(Boolean)
    .sort(compareText);
  const classificationText = [
    providerJob.title,
    descriptionText,
    ...metadataText,
  ].join(" ");
  const ukEligibility = classifyUkEligibility(
    providerJob.location,
    classificationText,
  );

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
        };
  }

  const compensationRaw = compensationEvidence(descriptionText, metadataText);
  const compensation = parseCompensation(compensationRaw ?? "");
  const content: Omit<NormalisedJob, "contentHash"> = {
    sourceId: source.id,
    providerJobId: providerJob.providerJobId,
    title: htmlToPlainText(providerJob.title),
    employer: htmlToPlainText(source.employerName),
    descriptionText,
    applicationUrl,
    countryCode: "GB",
    ukEligibilityEvidence: ukEligibility.evidence,
    employmentType: classifyEmployment(classificationText),
    workingTime: classifyWorkingTime(classificationText),
    workplaceType: classifyWorkplace(providerJob.location, classificationText),
    ir35Status: classifyIr35(classificationText),
    compensationRaw,
    compensationMinimum: compensation.minimum,
    compensationMaximum: compensation.maximum,
    compensationCurrency: compensation.currency,
    compensationPeriod: compensation.period,
    postedAt: null,
    closesAt: null,
  };
  const contentHash = await hashNormalisedJobContent(content);

  return {
    outcome: "eligible",
    job: normalisedJobSchema.parse({ ...content, contentHash }),
  };
}

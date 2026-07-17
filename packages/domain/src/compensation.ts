import type { compensationPeriods } from "./job";

type CompensationPeriod = (typeof compensationPeriods)[number];

export type ParsedCompensation = {
  currency: "GBP" | null;
  minimum: number | null;
  maximum: number | null;
  period: CompensationPeriod;
};

const periodPatterns: readonly [RegExp, CompensationPeriod][] = [
  [/\b(?:per\s+hour|hourly)\b/i, "hour"],
  [/\b(?:per\s+day|daily|day\s+rate)\b/i, "day"],
  [/\b(?:per\s+week|weekly)\b/i, "week"],
  [/\b(?:per\s+month|monthly)\b/i, "month"],
  [/\b(?:per\s+year|per\s+annum|annually|annual|yearly)\b/i, "year"],
];

const gbpCurrencyMarker = /(?:£|\bGBP\b)/i;

function classifyPeriod(raw: string): CompensationPeriod {
  for (const [pattern, period] of periodPatterns) {
    if (pattern.test(raw)) return period;
  }

  return "unknown";
}

const amountSource = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?[kK]?`;
const amountCandidateSource = String.raw`\d[\d.,]*[kK]?`;
const amountStart = String.raw`(?<![\w.,])`;
const amountEnd = String.raw`(?![\w.,])`;
const rangeSeparator = String.raw`\s*(?:-|–|—|to)\s*`;

const nonGbpCurrencySymbolAdjacentToAmount = new RegExp(
  `(?:(?!£)\\p{Sc})\\s*${amountCandidateSource}${amountEnd}|${amountStart}${amountCandidateSource}\\s*(?!£)\\p{Sc}`,
  "u",
);
const nonGbpCurrencyCodeAdjacentToAmount = new RegExp(
  `\\b(?!GBP\\b)[A-Z]{3}\\s*${amountCandidateSource}${amountEnd}|${amountStart}${amountCandidateSource}\\s*(?!GBP\\b)[A-Z]{3}\\b`,
);

function hasUnsupportedCurrencyAdjacentToAmount(raw: string): boolean {
  return (
    nonGbpCurrencySymbolAdjacentToAmount.test(raw) ||
    nonGbpCurrencyCodeAdjacentToAmount.test(raw)
  );
}

const rangeCandidatePattern = new RegExp(
  `${amountStart}(?:(£|GBP)\\s*)?(${amountCandidateSource})(?:\\s*(GBP))?${rangeSeparator}(?:(£|GBP)\\s*)?(${amountCandidateSource})(?:\\s*(GBP))?${amountEnd}`,
  "gi",
);

const singleAmountPatterns = [
  new RegExp(`£\\s*(${amountSource})${amountEnd}`, "i"),
  new RegExp(`\\bGBP\\s*(${amountSource})${amountEnd}`, "i"),
  new RegExp(`${amountStart}(${amountSource})${amountEnd}\\s+GBP\\b`, "i"),
] as const;

function toMinorUnits(
  rawAmount: string,
  usesSharedThousandsSuffix = false,
): number | null {
  if (!new RegExp(`^${amountSource}$`).test(rawAmount)) return null;

  const usesThousandsSuffix =
    usesSharedThousandsSuffix || /k$/i.test(rawAmount);
  const majorUnits = Number(rawAmount.replaceAll(",", "").replace(/k$/i, ""));
  const minorUnits = Math.round(
    majorUnits * (usesThousandsSuffix ? 1_000 : 1) * 100,
  );

  return Number.isSafeInteger(minorUnits) && minorUnits >= 0
    ? minorUnits
    : null;
}

type RangeCandidateResult =
  { found: false } | { found: true; amounts: readonly [number, number] | null };

function findRangeCandidate(raw: string): RangeCandidateResult {
  for (const match of raw.matchAll(rangeCandidatePattern)) {
    const currencyMarkers = [match[1], match[3], match[4], match[6]];
    if (!currencyMarkers.some(Boolean)) continue;

    const firstAmount = match[2];
    const secondAmount = match[5];
    const usesSharedThousandsSuffix =
      /k$/i.test(firstAmount) !== /k$/i.test(secondAmount);
    const minimum = toMinorUnits(firstAmount, usesSharedThousandsSuffix);
    const maximum = toMinorUnits(secondAmount, usesSharedThousandsSuffix);

    return {
      found: true,
      amounts: minimum === null || maximum === null ? null : [minimum, maximum],
    };
  }

  return { found: false };
}

function findAmounts(raw: string): readonly [number, number | null] | null {
  const rangeCandidate = findRangeCandidate(raw);
  if (rangeCandidate.found) return rangeCandidate.amounts;

  for (const pattern of singleAmountPatterns) {
    const match = raw.match(pattern);
    if (!match) continue;

    const minimum = toMinorUnits(match[1]);
    return minimum === null ? null : [minimum, null];
  }

  return null;
}

export function parseCompensation(raw: string): ParsedCompensation {
  const period = classifyPeriod(raw);
  const hasGbp = gbpCurrencyMarker.test(raw);
  if (hasGbp && hasUnsupportedCurrencyAdjacentToAmount(raw)) {
    return {
      currency: null,
      minimum: null,
      maximum: null,
      period,
    };
  }

  if (!hasGbp) {
    return {
      currency: null,
      minimum: null,
      maximum: null,
      period,
    };
  }

  const amounts = findAmounts(raw);

  return {
    currency: "GBP",
    minimum: amounts?.[0] ?? null,
    maximum: amounts?.[1] ?? null,
    period,
  };
}

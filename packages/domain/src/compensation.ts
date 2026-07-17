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

function classifyPeriod(raw: string): CompensationPeriod {
  for (const [pattern, period] of periodPatterns) {
    if (pattern.test(raw)) return period;
  }

  return "unknown";
}

function toMinorUnits(rawAmount: string): number {
  return Math.round(Number(rawAmount.replaceAll(",", "")) * 100);
}

export function parseCompensation(raw: string): ParsedCompensation {
  const period = classifyPeriod(raw);
  if (!/(?:£|\bGBP\b)/i.test(raw)) {
    return {
      currency: null,
      minimum: null,
      maximum: null,
      period,
    };
  }

  const amounts = Array.from(
    raw.matchAll(/(?:£\s*|\bGBP\s*)(\d[\d,]*(?:\.\d{1,2})?)/gi),
    (match) => toMinorUnits(match[1]),
  );

  return {
    currency: "GBP",
    minimum: amounts[0] ?? null,
    maximum: amounts[1] ?? null,
    period,
  };
}

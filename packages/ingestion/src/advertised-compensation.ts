import { parseCompensation } from "@jobwarden/domain";

import type { ProviderCompensation } from "./types.ts";

/**
 * An advertised salary read from free provider text.
 *
 * **This exists because two adapters got the units wrong in the same way, and
 * the second one copied the first one's test.** `parseCompensation` returns
 * **minor units** (pence), because that is what the normaliser stores.
 * `ProviderCompensation.minimum`/`maximum` are **major units** (pounds),
 * because `normaliseProviderJob` multiplies an adapter's figure by 100 on the
 * way in. Passing one straight to the other publishes a salary **100× too
 * high**, labelled `advertised` — the strongest provenance the product has, over
 * a figure the advert never stated.
 *
 * Reed and Lever were correct because they receive numbers from their providers
 * already in major units and pass them through untouched. Ashby and Teaching
 * Vacancies both parse text, both reached for `parseCompensation`, and both
 * landed the result in the wrong unit. An independent review caught it after it
 * had shipped twice.
 *
 * Every adapter that reads a salary out of free text should call this rather
 * than `parseCompensation`, so the conversion exists once.
 *
 * The employer stated the text, so provenance is `advertised` even where the
 * parser resolves no figure from it. Nothing here is ever estimated: text the
 * parser cannot read keeps its raw string with null bounds rather than a guess.
 */
export function advertisedCompensationFromText(
  text: string | null | undefined,
  observedAt: string,
): ProviderCompensation {
  const raw = text?.trim();

  if (!raw) {
    return {
      raw: null,
      minimum: null,
      maximum: null,
      currency: null,
      period: "unknown",
      provenance: "unknown",
      observedAt: null,
    };
  }

  const parsed = parseCompensation(raw);

  return {
    raw,
    minimum: toMajorUnits(parsed.minimum),
    maximum: toMajorUnits(parsed.maximum),
    currency: parsed.currency,
    period: parsed.period,
    provenance: "advertised",
    observedAt,
  };
}

/**
 * Minor units to major units.
 *
 * The round trip is exact for the two-decimal amounts money is written in:
 * `1271` becomes `12.71` here and `Math.round(12.71 * 100)` returns `1271` in
 * the normaliser, so an hourly rate survives without drift.
 */
function toMajorUnits(minorUnits: number | null): number | null {
  return minorUnits === null ? null : minorUnits / 100;
}

/**
 * Per-listing source attribution.
 *
 * Adzuna's licence requires the exact "Jobs by Adzuna" credit to be shown on
 * every published Adzuna listing — the search and matches cards, the detail
 * page, the applications tracker, and the digest email. Other sources are the
 * employer's own board posting and need no attribution, so they return null and
 * nothing renders. Kept in the domain package so every surface, server or
 * client, credits a listing identically.
 */
export function sourceAttribution(
  sourceProvider: string | null | undefined,
): string | null {
  return sourceProvider === "adzuna" ? "Jobs by Adzuna" : null;
}

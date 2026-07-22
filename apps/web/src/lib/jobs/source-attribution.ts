/**
 * Per-listing source attribution.
 *
 * Adzuna's licence requires the exact "Jobs by Adzuna" credit to be shown on
 * every published Adzuna listing. Other sources are the employer's own board
 * posting and carry no attribution requirement, so they return null and nothing
 * renders. Kept in one place so every surface that shows a listing — the search
 * feed, the matches feed and the detail page — credits it identically.
 */
export function sourceAttribution(
  sourceProvider: string | null | undefined,
): string | null {
  return sourceProvider === "adzuna" ? "Jobs by Adzuna" : null;
}

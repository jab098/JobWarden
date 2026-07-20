# UK eligibility classifier — unrecognised locations are not foreign locations

## Why

`assessLocation` in `packages/domain/src/classification.ts` treats any location label it does not recognise as evidence *against* the UK, and its fallback is `non_uk`:

```ts
const hasContradictoryQualifier = labels.some(
  (label) => !isQualifiedUkLabel(label) && !nonLocationLabels.has(label),
);
if (hasUkEvidence && !hasContradictoryQualifier) return { outcome: "eligible" };
return { outcome: "non_uk" };
```

Recognition is a hand-written allowlist of 27 cities and 9 official regions. Almost every real UK advert is written "Town, County", so the county label is unrecognised, counts as contradiction, and the advert is positively excluded.

Measured against the 230-place dataset Task 25 already ships, with a neutral description:

| Advert location format                    | Excluded        |
| ----------------------------------------- | --------------- |
| `"Town"` — e.g. `Aberystwyth`             | 204/230 (88.7%) |
| `"Town, Nation"` — `Aberystwyth, Wales`   | 204/230 (88.7%) |
| `"Town, County"` — typical ATS output     | 220/230 (95.7%) |
| `"Town, County, Nation"`                  | 220/230 (95.7%) |

`Salford, England` says *England* explicitly and is still excluded, because `Salford` is not one of the 27.

Two things made this survive since Task 2. `classifyUkEligibility` returns on a `non_uk` location *before* reading the description, so "based in our Salford office in the UK" cannot rescue it. And the outcome is `excluded`, not `quarantined`: `supabase/functions/ingest-jobs/handler.ts:240` skips both identically, nothing is persisted, and the run record counts only `receivedCount` and `eligibleCount`. A source discarding 95% of its stock reads as a source without much UK content.

## The constraint that shapes the fix

The current logic is accidentally right on foreign places and catastrophically wrong on UK ones. `London, Ontario` is excluded only because `Ontario` is unrecognised. Make unrecognised labels neutral without adding anything else and `London, Ontario`, `Birmingham, Alabama`, and `Manchester, New Hampshire` all become eligible — a false claim of UK eligibility, which is the worse error and the one invariant this product cannot break.

The existing suite already pins those cases (`London, Ontario`, `London, Kentucky`, `New York, NY`, `North West, USA`, `South East, Australia`), and `North West, USA` pairs a *UK* region name with a foreign one. So exclusion must outrank UK evidence, not merely coexist with it.

## Design

`assessLocation` becomes three ordered questions:

1. **Positive foreign signal → `non_uk`.** Checked first, so it beats UK evidence. This is what keeps `London, Ontario` out.
2. **UK signal → `eligible`.**
3. **Neither → `ambiguous`.** An unrecognised label is unknown, not foreign. `ambiguous` already routes to `quarantined` in `normalise.ts`, so these become reviewable rather than discarded.

Exclusion now requires naming a real foreign place. Absence of recognition no longer excludes anything.

### Widening UK recognition

The 230-place gazetteer from Task 25 supplements the 27-city allowlist, matched **exactly** per label rather than through `resolveUkPlaces`. That function matches *contained* names, which is right for search and wrong here: `resolveUkPlaces("New York City")` returns York. Exact lookup also loses nothing measurable, because `splitLocation` has already reduced `"Leeds, West Yorkshire (hybrid)"` to clean labels and the town label is exact.

`uk-places.ts` gains `isUkPlaceName`, three lines over the index it already builds.

The 27-city allowlist stays: `Derry` and `Newcastle` are in it but not in the gazetteer, which carries `Londonderry` and `Newcastle upon Tyne`. Deleting it would regress both.

### The foreign set

Countries and first-level subdivisions of the main English-speaking countries — US states and their two-letter abbreviations, Canadian provinces, Australian states — not foreign *cities*.

The collision that matters is a UK-named city beside a foreign region (`Birmingham, Alabama`, `London, KY`), and region-level entries are what disambiguate it. Foreign city names would add homonym risk against real UK towns (`Boston`, `Washington`) while adding no cover: a bare `Paris` label matches no UK name, falls to `ambiguous`, and is quarantined rather than published. Every candidate entry was checked against the 230-place dataset for collisions; there are none.

Two-letter state abbreviations are required, not optional: `Boston, MA` and `Manchester, NH` are the realistic false-publish cases, and `manchester` is UK-recognised.

## Scope

This change is the classifier only. The observability gap — that `excluded` and `quarantined` are indistinguishable in the run record — is what let the defect hide, and it needs a migration, the Edge Function repository, pgTAP, and an admin surface. That is its own task and its own review; bundling it would delay the fix that recovers the stock and would blur a review that should stay on the UK-only invariant.

## Verification

The pinned foreign cases are the regression guard and must stay green. New coverage:

- `Salford, England`, `Leeds, West Yorkshire`, `Salford, Greater Manchester, England` are eligible.
- `London, Ontario`, `Birmingham, Alabama`, `Manchester, New Hampshire`, `Boston, MA`, `New York City` are excluded.
- An unrecognised location is `ambiguous`, not `non_uk`.
- The measured exclusion rate over the 230-place dataset falls to zero for all four advert formats.

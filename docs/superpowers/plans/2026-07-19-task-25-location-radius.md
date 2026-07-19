# Task 25 — Location and radius

## Why

`job_locations` has carried `latitude`, `longitude`, and `postcode_fragment` since Task 1 and nothing has ever written to them. Location matching was a single `ILIKE '%text%'` against the advert's raw location string, which is wrong in both directions at once:

- **Too narrow.** A search for Manchester never saw a role advertised in Salford, two miles away, or Trafford Park, three. "Within 10 miles of Leeds" is table stakes on every UK board and could not be expressed at all.
- **Too wide.** `ILIKE '%bath%'` matched Bathgate, four hundred miles from Bath.

## The data problem, and why it shaped the design

Radius search needs coordinates, and coordinates cannot be written from memory. A centroid that is a few miles wrong returns wrong jobs and looks exactly like a right answer — the worst failure mode available. So the place *names* are curated by hand, because names are the part that can be recalled reliably, and every *coordinate* comes from a real open dataset.

`scripts/build-uk-places.mjs` fetches them once, by hand, and commits the result. It is a build-time tool, not a runtime dependency: the product performs no geocoding request ever, so radius search has no external service to be rate-limited by, to go down, or to need a source-compliance record of its own.

Sources, both open and both attributed in the generated files:

- **Ordnance Survey Open Names** via postcodes.io, Open Government Licence v3, for Great Britain.
- **OpenStreetMap** via Nominatim, ODbL, for Northern Ireland and for names Open Names spells differently.

Building it surfaced two silent-wrong-answer bugs worth recording, because both looked like success:

1. **Open Names covers Great Britain only.** Northern Ireland resolved to zero places. A UK-wide product would have silently excluded a nation from every radius search.
2. **"Londonderry" resolved to a suburban area of Sandwell in the West Midlands**, three hundred miles from the city meant, and "Bangor" hinted at County Down resolved to the Welsh city because it is the only Bangor Open Names holds. Both passed an exact-name check.

The fix for the second is that a supplied disambiguating hint is now load-bearing: if it matches nothing, resolution *fails* and the fallback source answers, rather than accepting a plausible-looking wrong result. Failing loudly is the whole point.

## Design

Three layers, one shared definition of "the same place":

- `normalisePlaceName` in the domain package, `normalise` in the seed script, and `private.normalise_place_name` in the database must stay identical. A disagreement shows up as a location that matches in one layer and not another, so each carries a comment naming the other two.
- Distance is plain trigonometry in SQL. Neither PostGIS nor `earthdistance` is installed, both would have to be enabled in every environment, and the requirement is one distance between two points.
- Resolution prefers the **longest contained** place name, so "Newcastle upon Tyne" beats "Newcastle" on a string holding both, and pads with spaces so "Bath" cannot match "Bathgate".

The search itself keeps its existing shape. When a radius is set, `jobs_within_radius` returns job ids and the listing query filters on them; every other filter, the ordering, and the paging are untouched. The location inner join is dropped in that branch, because the ids already encode the location test and the join would drop listings it could not match.

A bounding box narrows candidate rows on the plain btree index before the trigonometry runs.

## Files

| File                                                | Change                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `scripts/build-uk-places.mjs`                        | new — build-time seed generator, two sources, fails loudly  |
| `packages/domain/src/uk-places.generated.json`       | new — 230 places, all four nations                          |
| `packages/domain/src/uk-places.ts`                   | new — resolution, distance, radius                          |
| `packages/domain/src/uk-places.test.ts`              | new                                                         |
| `supabase/seed/uk-places.generated.sql`              | new — same rows, generated in the same run                  |
| `supabase/migrations/202607200002_location_radius.sql` | new — table, distance, resolution, trigger, radius RPC     |
| `supabase/tests/013_location_radius.sql`             | new                                                         |
| `apps/web/src/lib/jobs/types.ts`, `filters.ts`       | `radius`, paired with `location`                            |
| `apps/web/src/lib/jobs/supabase-jobs.ts`             | radius branch                                               |
| `apps/web/src/lib/jobs/development-jobs.ts`          | same radius semantics in the fixture preview                |
| `apps/web/src/lib/jobs/radius-search.test.ts`        | new                                                         |
| `apps/web/src/components/jobs/job-filters.tsx`       | distance control                                            |

## Invariants held

- A radius applies only alongside a location; a radius around nothing is dropped, so the filter chips never claim "within 10 miles" of no stated place.
- An empty id set filters to nothing rather than being skipped. Skipping it would widen a ten-mile search to the whole country.
- The trigger never overwrites coordinates an ingestion adapter supplied; a real coordinate outranks a centroid.
- Reference data is read-only to the product and behind forced RLS.
- Only the five offered radii parse; anything else falls back to no radius.

## Verification

`pnpm verify`. Migrations and pgTAP are written and type-reviewed but not executed — no live Supabase, the owner-confirmed bar for this programme.

## Known ceilings

- The dataset is 230 settlements, not every UK postcode district. A job in a village the seed does not carry has no coordinates and is invisible to radius search, though it still matches by text. Extending the list is a data change, not a code change.
- `maximumRadiusMatches` bounds the id set at 5,000. A wide radius over a much larger catalogue would need the whole query pushed into SQL; the constant is marked `ponytail:` with that upgrade path.
- Digest and target-feed matching still use their existing location logic. Extending radius to those is deliberately a separate task rather than a silent change to what people already receive.

## Rollback

Revert the merge. The trigger only fills columns that were previously always null, and nothing reads them outside the radius branch.

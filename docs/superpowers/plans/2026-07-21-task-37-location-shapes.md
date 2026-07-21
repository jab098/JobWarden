# Task 37 — Location string-shape recognition

Plan written 2026-07-21, implemented the same day, all five changes as planned with no reversals. Read with [the roadmap's Task 37 section](../../product/roadmap.md), which carries the measurement this task comes from.

## Result

Re-measured on the same 44-shape probe the task was specified from: **16 published before, 23 after.** The seven recovered are exactly the targeted shapes — three full postcodes, `London, GB`, `London / Manchester`, `Anywhere in the UK`, `UK Wide`. No previously published shape regressed, and nothing that should stay out came in: `Nationwide`, all four Crown dependencies and every foreign location still drop.

**Where the remaining loss is, and why it was not taken.** Six shapes still drop that are not settlement-name gaps: `Home-based`, `Field-based, South East`, `London or Remote`, `GB-London`, `Multiple locations, UK`, and `Hybrid (London, 2 days per week)`. Two of those — `Multiple locations` and `Home-based` — would be one-line additions to `nonLocationLabels` and are genuinely tempting.

They were left deliberately. The list of shapes an advert can be written in has no end, and picking the next five from a probe means guessing at what feeds actually emit. `/admin/ingestion` records the real unrecognised-location list from real runs, and that is what should choose the next round. Guessing produced this task's first hypothesis, which was wrong.

The five settlement gaps the probe also found — Shoreditch, Camden, Stratford-upon-Avon, Ashby-de-la-Zouch, Berwick-upon-Tweed — are dataset work, not shape work, and are out of scope here for the reason given below.

## What this is not

The place **dataset** is not the problem, and this task must not be turned into a dataset expansion. `classifyUkEligibility` already publishes 72 of 73 plain UK city names. Widening `uk-places.generated.json` is a different change with a different cost — it is generated from postcodes.io and Nominatim by `scripts/build-uk-places.mjs`, carries centroids used by radius search, and is seeded into a migration. Missing settlements (Shoreditch, Berwick-upon-Tweed) are real gaps and belong to their own task.

This task changes only how location **strings** are read.

## The design being worked within

`assessLocation` is an allowlist and must stay one. Its rule is that **every** label must be recognised, not merely one, because "London, Ont." carries a real UK city beside a qualifier no denylist happens to hold. An unrecognised shape quarantines; it never publishes. Every change below adds recognised shapes and none relaxes that rule.

## Changes

### `packages/domain/src/classification.ts`

1. **UK postcodes become evidence.** A full UK postcode is unambiguous — the inward code is always digit-letter-letter, which is why a Canadian code like `K1A 0B1` (digit-letter-digit) cannot collide. Add a format check to `isQualifiedUkLabel`.

   **Full postcodes only.** A bare outward code stays ambiguous: `M1` is also a motorway, and short alphanumerics are not evidence of anything. Fail closed.

2. **`gb` joins `ukNationAnchors`.** It is the ISO 3166-1 code Greenhouse and Lever emit. Note the side effect and why it is safe: `namesUkNation` then short-circuits the foreign-region check for a label like `Paris, GB`, but the allowlist still refuses to publish it because `paris` is not a qualified UK label.

3. **A small closed set of nation-wide phrases.** `uk wide`, `uk-wide`, `anywhere in the uk`, `across the uk`, `throughout the uk`. Whole-label matches only, never containment, so nothing leaks in through a substring.

   **`nationwide` is deliberately excluded and gets a test saying so**, because it is also the name of a UK employer. Treating it as location evidence would publish on an employer string.

4. **`splitLocation` also splits on `/`.** `London / Manchester` is one unrecognised label today and becomes two recognised ones.

### `packages/domain/src/uk-places.ts`

5. **Administrative-area parts also split on `/`.** The dataset carries `Northern Ireland / Tuaisceart Éireann` as one region string, indexed whole and split only on `,` and ` - `. Once `splitLocation` splits on `/`, that string would arrive as two labels and the second would be unrecognised. This can only add entries to the set, so it cannot regress anything.

## Out of scope, deliberately

- Crown dependencies. Isle of Man, Jersey, Guernsey and Gibraltar quarantine today and that is **correct** — they are outside the UK for right-to-work. A test pins each so the boundary cannot be widened by accident.
- Bare outward codes, per change 1.
- `GB-London` style ISO subdivision strings. The real code is `GB-LND`; `GB-London` was an invention of the probe and no feed is known to emit it. Not built on speculation.
- Any new settlement name.

## Failing tests first

In `packages/domain/src/classification.test.ts`:

1. `EC2A 4NE`, `SW1A 1AA`, `M1 2AB` publish with the postcode as evidence;
2. `London, EC2A 4NE` publishes;
3. a bare `EC2A` stays ambiguous;
4. `K1A 0B1` (Canada) and `1234 AB` (Netherlands) stay ambiguous — the collision guard;
5. `London, GB` publishes;
6. `Paris, GB` does **not** publish, proving change 2's side effect is safe;
7. `UK Wide`, `Anywhere in the UK`, `Across the UK` publish;
8. `Nationwide` stays ambiguous;
9. `London / Manchester` publishes; `London / Springfield` does not;
10. `Belfast, Northern Ireland / Tuaisceart Éireann` publishes, proving change 5;
11. Isle of Man, Jersey, Guernsey, Gibraltar each stay ambiguous;
12. the existing 72-of-73 plain city behaviour is unchanged.

## Verification

`pnpm verify`, then `pnpm check:supabase`. No migration, no schema change, so the live gate is not required — but run `pnpm verify:live` anyway if `uk-places.ts` changes, because its dataset is also seeded into `202607220002_uk_places_seed.sql` and the two must not drift.

## Rollback

Pure logic in one package with no schema or data change. Reverting the commit restores the previous behaviour exactly.

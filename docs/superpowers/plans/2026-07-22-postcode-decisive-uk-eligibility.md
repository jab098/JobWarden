# Plan — A full UK postcode is decisive UK eligibility evidence

**Specified 2026-07-22**, from the live `/admin/ingestion` unrecognised-location list, not from a probe or the roadmap's guessed examples.

## Why this, and why not the gazetteer

`docs/project-status.md` ranks "widen the gazetteer" as the next task and names Shoreditch, Camden and Stratford-upon-Avon as the missing settlements. The production drop list disproves that framing, exactly as Task 37's dataset-size hypothesis was disproved: none of those names appear. Querying `public.ingestion_source_runs.unrecognised_locations` on the live project returns 220 distinct strings, and the single largest recoverable-UK category is **38 `Town, Region, Postcode` strings** — `Blandford Forum, South West, DT11 8EL`, `Chatham, South East, ME4 5JB`, and so on. Every one carries a valid UK postcode and a valid ONS region; every one quarantines.

Running the shipped classifier over them confirms the cause is not a missing region and not the postcode format check — both are recognised. It is the **town**. `assessLocation`'s barrier requires *every* comma-part to be a recognised UK label, so an unrecognised town quarantines the whole string even though the postcode beside it is decisive UK evidence. There is no bare-UK-town drop category in the data, so adding place names would recover ≈0 real jobs while carrying the `202607220002` migration landmine. The fix is in the classifier, not the dataset.

## The change

A full UK postcode pins an advert to a specific UK address. It is stronger evidence than the bare city name (`London`) that already publishes, and it cannot be forged by a foreign advert (the inward `digit-letter-letter` shape excludes Canadian codes; `je/gy/im/gx` Crown-dependency areas are already excluded from `isUkPostcode`). So a label that is a valid UK postcode should let the location publish even when a sibling town label is unrecognised.

### Files

- `packages/domain/src/classification.ts` — in `assessLocation`, publish when `labels.some(isUkPostcode)`, in addition to the existing "some qualified label and no unknown qualifier" path. No signature change; no other module touched.
- `packages/domain/src/classification.test.ts` — failing tests first (below).

### Interfaces

`classifyUkEligibility(location, description)` is unchanged. The only behavioural change: a location string containing a valid full UK postcode returns `eligible` / `explicit_uk_location` even when another part is unrecognised.

## Order of precedence preserved (the safety argument)

`classifyUkEligibility` already runs, in order: location `non_uk` → description `eligible` → description `non_uk` → location `eligible`. The postcode change only strengthens the *location `eligible`* branch, which is last. So:

- the foreign-region check inside `assessLocation` still runs first: `London, Ontario, <code>` is `non_uk` before the postcode is ever considered;
- a description that excludes the UK (`"…not available in the UK"`) still returns `non_uk` and overrides a postcode-eligible location;
- Crown-dependency postcodes (`JE/GY/IM/GX`) are already refused by `isUkPostcode` and stay refused;
- the change is monotonic — it only ever turns an existing `ambiguous` into `eligible`, never the reverse, and only when a decisive UK postcode is present.

## Failing tests (write first, watch fail, then implement)

Added to the `UK eligibility location shapes` describe block:

1. Publishes `Town, Region, Postcode` where the town is **not** in the gazetteer — the real drop shape: `Blandford Forum, South West, DT11 8EL`, `Burton-on-Trent, West Midlands, DE14 3TE`, `Chatham, South East, ME4 5JB`.
2. Publishes `Town, Postcode` with no region — `Chorleywood, WD3 6EW`.
3. Records the postcode in the evidence, so the publication is auditable to it (Task 37 acceptance).
4. A UK-excluding **description** still wins over a postcode location → `non_uk`.
5. Regression guards that must stay red: `St Helier, JE2 3QA` (Jersey), `London, Ontario` (foreign), `Springfield, IL 62701` (US) all stay unpublished.

The existing `publishes("London, EC2A 4NE")` test is left in place but is known-weak (London is recognised anyway); test 1 is the honest version.

## Verification

- `pnpm test --filter @jobwarden/domain` (or the workspace run) — new tests green, no regression.
- `pnpm verify` — format, lint, typecheck, deno check, full test suite, guardrails, build.
- No SQL is touched, so `verify:live`/Docker is **not** in scope; `check:supabase` is unaffected (no migration added).

## Rollback

Single-commit revert of the `assessLocation` change restores the prior barrier exactly; there is no data or schema state to unwind.

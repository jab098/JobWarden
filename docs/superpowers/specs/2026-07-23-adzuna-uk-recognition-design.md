# Adzuna UK-recognition: recover quarantined UK jobs (and with them, catalogue range)

Status: approved 2026-07-23. Supersedes the standing "do not read `area[0]`" note in
`packages/ingestion/src/adzuna.ts` — that deferral is now owner-authorised with evidence.

## Problem

One Adzuna run received 193 GB adverts and published **18**; **175 (91%)** quarantined as
`ambiguous_uk_eligibility`. The live sample of quarantined strings is **decisively UK** —
`Village, Town` pairs such as "Annandale, **Kilmarnock**", "Heeley, **Sheffield**",
"Twynyrodyn, **Merthyr Tydfil**". They quarantine only because the eligibility classifier
requires **every** comma-separated location label to be a recognised UK label (to keep
"Paris, GB" and "London, Ont." out), and Adzuna's leading label is an obscure village the
gazetteer does not carry.

Two owner concerns share this one root cause:

1. **Small pool** — 18 Adzuna jobs.
2. **Narrow range** — the catalogue skews to software-engineering (Greenhouse boards) and
   teaching (Teaching Vacancies). Adzuna's `/jobs/gb/search` carries **no category filter**,
   so it returns every sector (12 live results already spanned Teaching, Engineering,
   Healthcare & Nursing, Sales across 758,674 GB adverts). Recovering its UK jobs broadens
   the catalogue automatically.

The provider already asserts the jurisdiction: `area[0]` is **always** the literal `"UK"`
on the GB endpoint (verified live). The adapter deliberately ignored it; we now trust it.

## Design

Two small, isolated changes. No migration (pure code). Deterministic and evidence-bound.

The mechanism is a **provider-verified jurisdiction flag**, threaded adapter → classifier —
not a general free-text location rule. A general "names the UK ⇒ decisive" rule was
prototyped and **rejected**: it cannot distinguish an unknown UK village ("West Bowling,
Bradford") from an unknown foreign city in a multi-location advert ("London, England, Paris,
Ile-de-France"), because the foreign-anchor denylist is deliberately incomplete (the exact
reason the all-labels barrier exists). An existing Workable test — "does not publish an advert
spanning the UK and abroad" — caught the prototype publishing the mixed advert. Only the
provider's structural country assertion can safely tell the two apart, so the trust is scoped
to the provider that makes it.

### 1. Adzuna adapter (`packages/ingestion/src/adzuna.ts`)

The emitted `location` stays the **honest** settlement (`display_name`, or the most specific
non-UK area as a fallback) — unchanged. Each `ProviderJob` additionally carries
`assertsUkJurisdiction: area[0] === "UK" && no Crown-dependency/overseas area`. Crown
dependencies and overseas territories (Isle of Man, Jersey, Guernsey, Gibraltar) never carry
the assertion.

### 2. Classifier (`packages/domain/src/classification.ts`)

`classifyUkEligibility` gains an optional `{ providerAssertsUkJurisdiction }` input, evaluated
**last** — only after the location and description assessments. When set and neither the
location nor the description named anything foreign or UK-excluding (both would already have
returned `non_uk`), the advert is `eligible` with reason `explicit_uk_location`. `assessLocation`
is otherwise unchanged: the all-labels barrier still governs free-text providers, so a Workable
"London … Paris" advert with no flag still quarantines.

Defence in depth: the Crown dependencies / overseas territories (`isle of man`, `jersey`,
`guernsey`, `gibraltar`) are added to the foreign-anchor set so they are refused **by name** as
well as by their existing `nonUkPostcodeAreas` exclusion — so even if the adapter guard were
bypassed, a Crown-dependency location returns `non_uk` before the flag is consulted.

### 3. Pipeline (`packages/ingestion/src/normalise.ts`, `types.ts`)

`ProviderJob` gains the optional `assertsUkJurisdiction?: boolean`; `normaliseProviderJob`
passes it into `classifyUkEligibility`. Adapters that read a per-employer feed with no country
guarantee leave it unset, so their contract is unchanged.

### Precedence (unchanged, still first)

`classifyUkEligibility` runs the foreign-location check, then the description assessment
(a non-UK description returns `non_uk` **before** the location-eligible return), then the
location rule. So Adzuna's country assertion is the evidence, with the advert's own words
kept as a veto: a GB-classified advert whose text excludes UK applicants (e.g. "this role is
not based in the UK") is still refused.

### The judgment being made

This accepts Adzuna's **structured UK classification** (a country-scoped endpoint plus
`area[0]="UK"`) as the eligibility evidence, rather than re-deriving UK-ness from free text.
It is provider-verified, not a free-text guess, and the description-level foreign exclusions
remain the backstop.

## Out of scope (deliberate)

- No gazetteer widening (the migration-won't-re-run landmine; endless small hamlets).
- No relaxing the general barrier to "one UK place is enough" (reintroduces "London, Ont.").
- `sort_by=date` on the Adzuna query is a possible later freshness tweak, not needed here;
  the recognition fix already delivers range.

## Expected effect

~180 published per run instead of ~18 (nearly all of the 91% is recoverable UK), accumulating
across the working-hours schedule into a broad multi-sector pool. Free-tier request budget
untouched (~176 requests/month vs the 2,500 cap).

## Testing

- Classifier unit tests using the real quarantined `Village, Town` strings from a live Adzuna
  run as fixtures: with the assertion, `"West Bowling, Bradford"`, `"Canal Foot, Ulverston"`,
  `"Annandale, Kilmarnock"`, `"Padanaram, Forfar"` publish, and each is proven to stay
  quarantined **without** it (so the assertion, not a free-text rule, is doing the work). With
  the assertion still refuse `"London, Ontario"` (foreign location), `"Douglas, Isle of Man"`
  (Crown dependency by name), and a location whose description excludes UK applicants.
- Adapter unit tests: `assertsUkJurisdiction` is `true` for `area[0]="UK"` while `location`
  stays the honest settlement, and `false` for a Crown-dependency area.
- The pre-existing Workable "does not publish an advert spanning the UK and abroad" test is the
  guard that a general rule would have broken; it must stay green.

## Deployment

Pure code; no migration. The `ingest-jobs` Edge Function bundles `@jobwarden/domain` and
`@jobwarden/ingestion` from workspace source, so it must be **redeployed** after merge for the
change to take effect in production ingestion. Verify by triggering an Adzuna run and
confirming `upserted_count` rises well above 18 with `quarantined_ambiguous_count` falling.

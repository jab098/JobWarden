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

**What changes is the consequence of an unrecognised label, not the test for one.**

The first attempt at this made unrecognised labels neutral and moved the whole burden onto a denylist of foreign places. Independent review took it apart, and was right to: publication then depended on the *absence* of a denylist entry, which is the wrong direction for this invariant. Three ways through it, all verified:

- `London, Ont.` published. `isForeignLabel` matched on trim-and-lowercase while the UK side stripped punctuation, so every abbreviation written with a full stop evaded the denylist while the UK city still matched — 25 of 28 punctuated forms published, including `Manchester, N.H.` and `Bath, U.S.A.`
- `Bangor, ME`, `Newport, OR`, `Brighton, Victoria` published — four subdivisions were simply missing.
- `Hamilton, Bermuda` and `Newport, County Mayo` published, along with 135 of 136 probed qualifiers. All New Zealand regions, all Irish counties, and some sixty countries were absent, and always would be: a denylist of foreign places cannot be enumerated.

So `assessLocation` keeps the original allowlist test and changes only what happens when it fails:

1. **A UK nation anchor present → skip the foreign check.** Washington in Tyne and Wear is a town of 67,000, and `Washington, England` says which one it means.
2. **A named foreign qualifier → `non_uk`.** Defence in depth, not the barrier.
3. **UK evidence and *every* label recognised → `eligible`.** This is the barrier. `London, Ont.` fails it because `ont.` is not recognised, no matter what any denylist holds.
4. **Otherwise → `ambiguous`.** This is the fix: `ambiguous` routes to `quarantined` in `normalise.ts`, so these are reviewable rather than discarded.

The denylist survives only to answer honestly where the answer is known — `London, Ontario` is `non_uk` rather than clogging a review queue. Because it is no longer load-bearing, entries are omitted rather than risked: no bare abbreviations, since fifteen UK postcode areas are two letters and `Derby, DE` would be discarded, and no name shared with a UK place, which removed `washington` and kept out `victoria`, `boston`, `perth` and `hamilton`.

### Known limit

A location whose every label is a real UK place name cannot be told from a UK one by name alone. The inputs that actually publish are `Lincoln, Canterbury` and `Oxford, Canterbury` — both real New Zealand towns, where Canterbury is also a city in Kent — and `Newport, Manchester`, a parish in Jamaica.

Naming a country closes it: `Lincoln, Canterbury, New Zealand` is `non_uk`. The exposure is a two-label advert naming no country.

Closing it properly would mean requiring qualifier positions to be administrative areas rather than any UK place name, which costs `London, Canary Wharf` and `Manchester, Salford Quays` — measured, both fall to quarantine. Not worth it. The limit is documented in the test suite rather than asserted away.

(An earlier draft of this section cited `Christchurch, Canterbury`. That input is safe, for a reason unrelated to Canterbury — Christchurch is not in the gazetteer — so it would have led a reader to conclude the case was handled.)

### Widening UK recognition

Because publication now requires *every* label to be recognised, recognition has to cover the county half of "Town, County" or the fix does nothing.

- **Towns** come from the 230-place Task 25 gazetteer, matched **exactly** per label rather than through `resolveUkPlaces`. That function matches *contained* names, which is right for search and wrong here: `resolveUkPlaces("New York City")` returns York.
- **Administrative areas** are derived from the dataset's own `county` and `region` fields — 146 and 14 distinct values, free. Multi-name values are indexed part-wise as well as whole, because `Caerdydd - Cardiff` and `Bournemouth, Christchurch and Poole` each name several places and an advert writes one of them.
- **Ceremonial counties** need a hand list of 47. The dataset stores the *unitary authority* — Leeds's county is "Leeds" — so it cannot supply `West Yorkshire`, and that is how adverts are written. The other 47 checked were already covered.

`uk-places.ts` gains `isUkPlaceName` and `isUkAdministrativeArea` over the index it already builds.

Of the 27-city allowlist, 25 are now redundant and were deleted. `Derry` and `Newcastle` remain: the gazetteer spells them `Londonderry` and `Newcastle upon Tyne`.

## Scope

This change is the classifier only. The observability gap — that `excluded` and `quarantined` are indistinguishable in the run record — is what let the defect hide, and it needs a migration, the Edge Function repository, pgTAP, and an admin surface. That is its own task and its own review; bundling it would delay the fix that recovers the stock and would blur a review that should stay on the UK-only invariant.

## Verification

The pinned foreign cases are the regression guard and stay green. New coverage:

- All 230 bundled places publish in all four advert formats — 230/230, against 26 and 10 before.
- Thirteen "Town, ceremonial county" cases publish. These cannot pass by construction the way a sweep over the dataset's own county field can, which is the flaw review found in the first sweep: `isUkPlaceName(place.name)` is true for all 230 places by definition, so that test passed even with the foreign check deleted.
- **The inverse sweep**: all 230 place names crossed with thirteen foreign qualifiers — including `Ont.`, `N.H.`, `ME`, `Victoria`, `Bermuda`, `Otago`, `County Mayo` — never publish. This is the test that fails if the barrier is ever weakened back to a denylist, and it is the one that would have caught the first attempt.
- `Washington, England` and `Washington, Tyne and Wear` are `ambiguous`, not `non_uk`.

One behaviour changed that is worth recording: because `non_uk` from a location is now strictly rarer, a location like `Amsterdam` or `Dubai` paired with a description saying "Applicants must be based in the UK" now publishes where it was previously excluded on the location alone. That follows the specification — explicit UK eligibility evidence in the advert body is exactly what the description rules exist to read — but it was not an intended part of this change.

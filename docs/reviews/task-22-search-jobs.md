# Task 22 Search Jobs, Route Naming, and Onboarding Follow-Ups Review

**Branch:** `codex/task-22-search-jobs`

**Base:** `main` after the Task 20 publication record (`4c6d93b`)

**Review status:** independent review APPROVED on the remediated head. All four important findings fixed test-first; the reviewer's three residual minors were also closed.

## Why this task exists

The owner asked for three things: resolve the two follow-ups recorded in the Task 19 review, give browsing every UK listing a page of its own, and rename the two surfaces whose names had stopped describing what they do.

## The naming decision

The owner chose the names from three options each.

| Surface           | Was                       | Is                                                     |
| ----------------- | ------------------------- | ------------------------------------------------------ |
| Personalised feed | `/jobs` (default view)    | `/matches`, nav "Matches", heading "Your matches"      |
| Browse everything | `/jobs?view=all`          | `/jobs`, nav "Search jobs", heading "Search jobs"      |
| Adjacent careers  | `/explore`, nav "Explore" | `/pathways`, nav "Pathways", heading "Career pathways" |

`/jobs` keeps the browse role because job detail already lives at `/jobs/[jobId]`, so the hierarchy is correct and no redirect or dead URL is introduced. The `?view=` parameter, `resolveJobsView`, and the dual-mode branch are deleted rather than replaced.

The internal vocabulary is deliberately unchanged. `packages/domain/src/target-feed.ts`, `packages/domain/src/explore.ts`, the `explore_pathways` table, and `set_explore_enabled` keep their names, because renaming a concept the approved specification and the database both use would be churn with no user benefit. Only routes and the words users read changed.

## Follow-up 1 — completion is now one transaction

Task 19 wrote the search profile, digest preference, Explore choice, and completion through four sequential RPCs. Each was owner-fenced, but a failure between any two could leave a saved search behind a hub that never unlocked, or a completion whose preferences were never recorded.

Migration `202607190010_onboarding_completion.sql` adds `finish_onboarding`, whose plpgsql body calls the same four functions. A plpgsql body is one transaction, so the whole first-run configuration lands or none of it does. Every callee is untouched: each still re-derives the owner from `auth.uid()`, re-checks approved access, and re-takes the per-owner generation fence, so the wrapper adds atomicity without weakening a single check. `complete_onboarding` runs last, so the gate never opens over a half-written configuration.

## Follow-up 2 — the steps now actually ask

The steps collected nothing. Every question was prose and a Continue button, so `onboardingAnswersSchema` and `buildSearchProfileFromAnswers` always ran on an empty payload — the flow's entire reason for existing was inert for anyone without CV evidence.

Each step now posts its own answers inside the same action that records it, pre-filled from what was already given. `readStepAnswers` produces only the fields the submitting step owns, so a crafted field cannot record an answer to a question that step never asked, and the database's merging save cannot overwrite an answer given elsewhere. An unticked checkbox on a step that always renders it is read as an explicit no, which is how "I changed my mind about all of them" survives a revisit.

`unknown` is absent from every allow-list group by design: the matching gate never excludes a listing that does not state a value, so offering it would imply a constraint that does not exist. The CV path is asked for a target role and seniority on the preferences step, because it never reaches `aspirations` and confirmed evidence says what someone has done, never what they want next.

## What the search page does

Modelled on what a UK jobseeker expects from Reed, Indeed, or LinkedIn:

- keyword search across the job title, the employer, **and the advert body**;
- a location filter matched against the listing's stated UK locations;
- a date-posted window (24 hours to a month);
- a minimum salary paired with its period;
- the existing employment type, working time, workplace, IR35, and salary-provenance filters;
- sort by newest or by closing soonest, with closing dates shown on the row when they are near;
- every active choice as a chip that lifts only itself and keeps the rest of the search;
- save straight from a result, with a job already saved from matches saying so rather than offering to save it twice.

Everything is URL-backed and posts by GET, so the whole surface works without JavaScript, including sort.

### Two deliberate refusals

**No salary sort.** Sorting a £600 day rate against a £70,000 salary by raw amount ranks the salary higher. Making it honest needs an annual-equivalent conversion, which invents working-day assumptions the source data does not state — which the compensation invariant forbids. A `ponytail:` comment records the ceiling and what would have to be decided first.

**A pay floor needs its period.** A floor without a period would compare a day rate to a salary, so half an answer applies nothing. Setting a floor necessarily hides listings that state no salary, because they cannot be shown to meet it; the form says so rather than letting the count quietly drop. A floor of zero and a period of `unknown` are unreachable for the same reason: neither narrows anything while both would still hide unstated salaries.

## Two defects found and fixed during verification

**The onboarding redirect's filters applied nothing.** Task 19 redirected to `/jobs?<filters>`, but an enabled search profile — which finishing had just created — made that page render the scored view, which ignores job filters entirely. Every newly onboarded user had their preferences sitting in the address bar doing nothing. With `/jobs` now being the search page, those parameters apply for real.

**Nested forms in the confirmation step.** Reusing `ProfileEvidenceList` inside the step form nested its per-item decision forms inside the step's own. That is invalid HTML: the browser drops the inner form, so Confirm would have submitted the step and advanced the user past the confirmation instead of confirming anything. The jsdom tests did not catch it; the browser console did. The list now sits outside the step form, and a regression test asserts no `form form` exists — verified to fail against the reintroduced bug before being fixed.

Also corrected: the development onboarding preview claimed fourteen extractable concepts over an empty evidence list. The count is now derived from the fictional evidence it actually shows.

## Independent review findings, all remediated

The review found four important defects and a bad test of my own. Each fix has a test verified to fail against the bug first.

**A pay floor entered without a period was stored and then discarded.** The search page refuses a half-answered floor; onboarding accepted one, saved `minimum` against `period: "unknown"`, and the matching gate then dropped it silently. Someone who typed £45,000 and left the period unset got no floor and no explanation. The same rule now applies at both boundaries.

**Clearing a select could not clear it.** The module's own header states the contract — a step must declare every field it controls, because the database merge keeps any absent key. The checkbox and multi-select paths honoured it; the two selects omitted the key when set back to empty, so choosing "No preference" left the previously stored level in place and the page re-rendered showing it. Both vocabularies already carry an explicit unanswered member (`unspecified`, `unknown`), so the key is now always written and the fields map those back to the empty option.

**Browsing the catalogue depended on a personalisation read.** `/jobs` loads decisions so a saved job says so, but `Promise.all` meant a failed decisions query took down the whole search even though the jobs query had succeeded. It now degrades to unsaved save controls and still renders the listings, which is what the degraded-state requirement asks for.

**One preference, two answers.** Excluding unknown pay mapped the URL filter to `advertised`, which also hides every _estimated_ salary — while the matching gate for the same preference keeps them. Provenance is a tri-state the invariant requires be kept visibly distinct, and a one-value filter cannot express "advertised or estimated", so onboarding no longer narrows it at all. The preference still shapes matching through the search profile.

**The location filter was double-escaped, and its test would have passed either way.** `ilike` carries its own value, so it needs SQL LIKE escaping only; applying the quoted-operand layer `or()` needs sent the escape characters through literally, and a location containing `%`, `_`, or a backslash matched nothing. The test asserted the corrupted pattern. It is replaced by five real cases, and `*` is now escaped in both paths because PostgREST rewrites it to a wildcard — without that, `?location=*` matched everything.

Minor findings also fixed: `README.md` and `docs/product/roadmap.md` still described `?view=all` and `/explore`; `salaryPeriod=unknown` and `salaryMin=0` were URL-reachable; the chip and the option disagreed about the 24-hour window; three landmarks shared the accessible name "Search jobs"; a `toEqual` I had weakened to `toMatchObject` is restored; and a single stated location is now carried into the first-run redirect.

Accepted without change, with the reviewer's agreement: `getDecisions` reads the owner's whole decision history unbounded. It is RLS-scoped and holds one row per decision the user personally made, so a bound would be speculative.

The confirmation pass raised three residuals, all closed: the decisions fallback had no test (added, and verified to fail with the fallback removed); the `*` comment claimed the escape restores "contains an asterisk", which PostgREST's unconditional rewrite makes impossible — it matches nothing rather than everything, which is the part that mattered; and the salary-period options are now derived from the `salaryPeriods` vocabulary rather than hand-copied.

## Verification evidence

- `pnpm verify` passed on the final head after a frozen install: 1,134 workspace tests across 83 files, plus 130 function tests — 1,264 automated tests total. Formatting, lint, all typechecks, Deno graphs, guardrails, and the production build are included.
- `pnpm check:supabase`: 20 migrations, 32 forced-RLS tables.
- `pnpm check:production`: the development bypass still fails closed in a production build.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities. No dependency was added.
- `git diff --check` clean; Gitleaks found no leaks over `origin/main..HEAD`.
- Browser verification at 1440 px and true 390 px: search with all five new facets combined, chip removal preserving the rest of the search, sort links, `/matches`, `/pathways`, and the onboarding confirmation and preferences steps. No document overflow and no console errors in a fresh tab. `?location=50%25` returns zero jobs rather than the whole catalogue, confirming the wildcard fix.

## Environment limitations

- Docker is unavailable, so pgTAP file `021` (6 assertions) is statically verified only. Runtime SQL verification of `finish_onboarding` remains a pre-live gate.
- Keyword search runs an unindexed `ILIKE` over `description_text`. It is correct and bounded by the existing 25-row page, but a `pg_trgm` index or a generated `tsvector` column is the upgrade path once the catalogue is large enough to notice.

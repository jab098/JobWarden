# Task 12 Explore and Career Pathways Review

**Branch:** `codex/task-12-explore-pathways`

**Base:** `main` at `7d5ae26` (Task 11 publication)

**Review status:** placeholder — finalized after the independent review completes.

## Outcome

Task 12 implements the opt-in Explore feed for credible adjacent careers. A pure deterministic domain module (`packages/domain/src/explore.ts`) holds a curated UK pathway taxonomy — each pathway a role family with 5–12 weighted core skills — and an evaluator that credits only exact normalised-concept matches against **confirmed** evidence in the `skill`, `tool`, and `responsibility` categories. A pathway is suggested only when it reaches at least 70% weighted overlap (integer arithmetic, inclusive), carries no more than two significant unmatched core skills, and sits outside the user's active target role families (career-draft target families plus every enabled saved search's role families). Keyword or label coincidence earns nothing, and no AI participates anywhere in the path.

Migration `202607190002_explore_pathways.sql` adds owner-only `career_explore_settings` (opt-in, disabled by default) and `career_pathway_decisions` (dismissed/promoted, one row per owner and pathway) with forced RLS and read-only authenticated grants; both mutate only through security-definer RPCs (`set_explore_enabled`, `decide_career_pathway`) that check approved access and take the per-owner generation mutex first. Aggregate analytics live in the deliberately ownerless `explore_pathway_analytics` table whose schema admits only a grammar-constrained pathway concept, a bounded event name, and a counter — no owner column exists, so no CV snippet or identifying text can be stored. Career-profile deletion now also erases explore settings and pathway decisions; the ownerless aggregate counters survive by design because they identify nobody. pgTAP file 013 adds 24 static assertions and the static verifier now enforces 12 migrations and 24 forced-RLS tables.

The web layer (`apps/web/src/lib/explore/`) mirrors the target-feed architecture: a pure `buildExploreResult` shared by the fictional development repository and the caller-bound Supabase repository, RPC-only mutations, and a `promote` flow that rebuilds the suggestion server-side (never trusting client labels), creates an enabled named search profile through the existing evidence-bound `save_search_profile` path, then records the promotion. `/explore` gives the disabled state an honest opt-in explanation, and the enabled state suggestion cards with an accessible overlap figure, matched skills with the confirmed evidence labels used, gaps with significant ones marked, dismiss/restore and promote controls, a quiet disable control, and a threshold-explaining empty state. Explore joined the desktop rail and mobile navigation.

## Acceptance mapping

| Roadmap criterion | Evidence |
| --- | --- |
| Every suggestion meets the 70% weighted core-skill threshold and has no more than two significant gaps | `evaluateExplorePathways` qualifies a pathway only when `matchedWeight * 100 >= totalWeight * 70` and unmatched significant core skills ≤ 2; `packages/domain/src/explore.test.ts` locks the exact-70% boundary and the three-significant-gap exclusion. |
| Suggestions outside the threshold are absent even if keywords overlap | Credit requires exact normalised-concept equality against confirmed evidence; a test proves an evidence item whose *label* matches a core skill but whose concept differs earns nothing, and a taxonomy-wide test proves incidental `javascript`/`sql` evidence alone can never lift any pathway to 70%. |
| The user sees overlap, gaps, and the evidence used | Each suggestion card shows the integer overlap percentage (accessible label "Overlap N%"), every matched core skill with the confirmed evidence labels that matched it, and every gap with significant ones marked; locked by `explore-ui.test.tsx`. |
| Dismiss, disable, and promote-to-search-profile controls work | `decide_career_pathway` (dismissed/clear) and `set_explore_enabled` RPCs are owner-fenced with the generation mutex; `promote` recomputes suggestions server-side, builds a schema-validated enabled search draft (`buildPromotedSearchDraft`), saves it through the existing `save_search_profile` RPC, then records `promoted`. The UI wires all three with origin-checked server actions, a restorable dismissed list, and honest failure states; the fictional preview refuses every mutation with a visible alert. |
| Aggregate pathway analytics contain no CV snippets or identifying text | `explore_pathway_analytics` has exactly three columns (`pathway_concept` constrained to the normalised-concept grammar and ≤120 chars, `event` bounded to dismissed/promoted, `event_count`); no owner/user column exists, authenticated roles cannot read or write it, and pgTAP 013 asserts the exact column set plus constraint rejections. The static verifier fails if an owner/user column or unconstrained concept ever appears. |

## Verification evidence

- Frozen install; `pnpm verify` (formatting, lint, all typechecks, Deno graphs, workspace + function tests, guardrails, production build) passed; the workspace suite includes 207 domain tests (14 new Explore tests), 303 web tests (40 files), and 54 verifier tests.
- `pnpm check:supabase`: 12 migrations, 24 forced-RLS tables.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities.
- `git diff --check origin/main...HEAD` clean; Gitleaks over `origin/main..HEAD` (5 commits) found no leaks.
- Browser verification in the exact local development bypass at 1440 px and true 390 px: `/explore` renders the enabled fictional state with one credible pathway at 71% overlap (matched evidence and gaps visible), no horizontal overflow, no fresh console errors; the mobile sheet lists Jobs/Explore/Career profile; a preview dismissal returns the honest "Explore changes are unavailable in this preview." alert; `/jobs` target feed is unaffected.

## Environment limitations

Docker, the Supabase CLI, and pg_prove remain unavailable, so migration 12 and pgTAP 013 are verified statically only. Runtime SQL verification (`supabase db reset` + the full pgTAP suite through `013_explore_pathways.sql`) remains a mandatory pre-live gate. Live authentication remains deferred by the owner; all browser evidence uses the documented fail-closed fictional development bypass.

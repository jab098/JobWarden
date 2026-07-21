# Task 30b — Provider vocabulary widening

Plan written 2026-07-21. Read with [the roadmap](../../product/roadmap.md), [project status](../../project-status.md), and [source coverage](../../product/source-coverage.md).

## Goal

Widen the provider vocabulary from `('greenhouse', 'reed')` to a list the remaining ATS providers join by adding a value. Task 30a already shipped the Lever **adapter** in TypeScript, but `lever` is not a value the database will accept, so the adapter cannot be configured as a source. This task closes that gap and makes Tasks 31 and 32 cheap.

Nothing about ingestion behaviour changes. No new source is enabled. No adapter is added.

## The site map, corrected

**The roadmap's list of sites is partly stale and following it literally would waste a slice.** It names guards "across `202607170003_audit_and_ingestion.sql`, `202607180002_shared_ingestion_runtime.sql` and `202607180003_uk_coverage_compensation.sql`". Verified on 2026-07-21: **every provider guard in `202607170003` and `202607180002` is already superseded** by a later `create or replace`. Only the latest definition of each function is live, and only those need widening.

Migration history is never edited. This task adds **one new migration** that `create or replace`s each live definition.

### Live definitions requiring change

| Object | Latest definition | Current vocabulary |
| ------ | ----------------- | ------------------ |
| `job_sources_supported_provider` constraint | `202607180003:6` | binds `greenhouse`→`complete`, `reed`→`incremental` plus a fixed board token, employer and host |
| `job_sources_reed_minimum_interval` constraint | `202607180003:16` | `provider <> 'reed' or minimum_sync_interval >= interval '6 hours'` |
| `public.upsert_job_source` | `202607180001:8` | guard at `:34`, `provider_name is distinct from 'greenhouse'` |
| `public.start_source_ingestion` | `202607180003:260` | guard at `:285`, `provider not in ('greenhouse', 'reed')` |
| `public.enqueue_scheduled_ingestion` | `202607180003:309` | filter at `:322` |
| `public.claim_ingestion_requests` | `202607180003:346` | filters at `:437` and `:466` |
| `public.upsert_ingested_jobs` | `202607180003:508` | guard at `:558` |
| `private.rematerialize_canonical_job` | `202607200003:24` | ordering `case` at `:56` |

### Superseded, do not touch

`202607170003:244`, `:398`, `:480` and `202607180002:61`, `:184`, `:213`. Confirm this is still true at slice start by re-running the function-definition map; a migration added after this plan could change it.

### Checked and clean

`public.request_source_ingestion` (`202607180001:200`), `public.get_job_source_health` (`202607180003:942`) and `public.finish_source_ingestion` (`202607200004:34`, a bare `create function`) contain **no** provider literal. Verified 2026-07-21 by grepping every `'greenhouse'` and `'reed'` literal across all migrations and mapping each hit to its enclosing function: every one falls inside the eight objects in the table above, or inside the two constraints.

Re-run that grep at slice start anyway. It is two commands, and a missed guard is a source that silently cannot run.

`public.finish_source_ingestion` deserves one specific look despite being clean: it is the only one of these declared with a bare `create function` rather than `create or replace`, so if its signature is ever touched the ACL trap below applies to it with no safety net.

## Target vocabulary

```
greenhouse | lever | ashby | workable  -> coverage_mode = 'complete'
reed                                   -> coverage_mode = 'incremental', existing identity bindings unchanged
```

The three ATS boards are `complete` like Greenhouse, so complete-snapshot omission counting applies to them. Reed's `incremental` semantics and its 6-hour minimum interval are untouched.

Add `ashby` and `workable` values in this task even though their adapters land in 31 and 32. A value with no adapter cannot be configured into a runnable source — `upsert_job_source` still validates identity, and the source ships disabled — and it means 31 and 32 add an adapter and fixtures without reopening definer SQL.

## The ACL trap, and why it is fatal here

Task 25c's review found that `drop function` + `create function` resets the ACL to PostgreSQL's default `EXECUTE` to `PUBLIC`. That left a security-definer ingestion function reachable by the anon key while `verify-supabase-foundation.mjs` certified it as revoked.

**Every function in this task uses `create or replace`.** No drops. If a signature genuinely must change, the migration revokes and grants explicitly and the static verifier is checked against it.

Constraints are different — a `check` constraint cannot be replaced in place, so those are `drop constraint` + `add constraint` within the single transaction. Constraints carry no ACL, so the trap does not apply, but the drop and add must be in the same migration.

## Failing tests first

Write these before the migration, and confirm each fails for the stated reason.

**pgTAP** — extend `supabase/tests/006_uk_coverage_compensation.sql`, or add a new file if it grows past a comfortable size:

1. a `lever` source with `coverage_mode = 'complete'` inserts successfully — fails now on `job_sources_supported_provider`;
2. the same for `ashby` and `workable`;
3. a `lever` source with `coverage_mode = 'incremental'` is **rejected** — the mode is constrained at the boundary, not by convention;
4. `reed` still requires `incremental`, its fixed board token, employer name and host, and its 6-hour minimum interval — a regression guard on the branch being edited;
5. an unknown provider such as `indeed` is still rejected;
6. `upsert_job_source` accepts `lever` and still rejects an unknown provider;
7. `start_source_ingestion`, `enqueue_scheduled_ingestion`, `claim_ingestion_requests` and `upsert_ingested_jobs` each accept a `lever` source and still reject an unknown one;
8. **privilege assertions run against every replaced function** — `anon` cannot execute any of them. This is the assertion class that Task 25c shipped broken because it never executed. It executes now; watch it actually run.

**TypeScript** — extend the existing suites rather than adding new files:

9. `JobSource` accepts `lever`, `ashby` and `workable` and the adapter dispatch resolves Lever to the shipped adapter;
10. the Edge Function row schema parses a `lever` row and rejects an unknown provider;
11. the admin source form offers the new providers and validates their identifiers.

## Files

Database — one new migration, `supabase/migrations/2026072100XX_provider_vocabulary.sql` (confirm the next free timestamp at slice start).

TypeScript:

- `packages/ingestion/src/types.ts` — the `JobSource` discriminated union
- `supabase/functions/ingest-jobs/repository.ts` — `z.enum(["greenhouse", "reed"])` and the Reed-shaped row assertion
- `supabase/functions/ingest-jobs/index.ts` — adapter dispatch
- `apps/web/src/components/admin/source-form.tsx`
- `apps/web/src/components/admin/source-list.tsx`
- `apps/web/src/lib/admin/types.ts`
- `apps/web/src/lib/sources/development-sources.ts`

Grep for `"greenhouse"` and `"reed"` across `apps/`, `packages/` and `supabase/functions/` before declaring the list complete. The vocabulary is hardcoded in more places than any single document tracks, which is the whole reason this task exists.

## Verification

```
npx supabase start
pnpm verify:live      # 28 migrations + this one, db lint, pgTAP
npx supabase stop
pnpm verify           # format, lint, typecheck, deno, tests, guardrails, build
```

Run the live gate **as you go, not at the end**. Task 25c's hole reached `main` because 850 lines of definer SQL were written against a check that never executed. It executes now, and this task is the first source-vocabulary work that lands on a green gate.

Three traps recorded in `docs/project-status.md`: `npx supabase start` must run before `pnpm verify:live`, the Supabase CLI resolves through npx rather than being a dependency, and **`pnpm verify` does not run the script tests**.

## Rollback

The migration is additive to the vocabulary and changes no data. Rolling back means a follow-up migration that `create or replace`s each function with the narrower list and restores the narrower constraint — which fails if any `lever`, `ashby` or `workable` source row exists, so remove those rows first. No source is enabled by this task, so in practice no such row should exist outside tests.

## Out of scope

No adapter. No new source enabled. No change to Reed's semantics, cadence or identity bindings. No change to omission counting or closure. Ashby and Workable adapters remain Tasks 31 and 32.

# Ingestion drop visibility — say why a job was discarded, and which place was not recognised

## Why

The UK eligibility classifier discarded 88.7–95.7% of genuine UK adverts for twenty-five tasks and nothing showed it. The reason is recorded in `docs/superpowers/plans/2026-07-20-uk-eligibility-classifier.md`: `supabase/functions/ingest-jobs/handler.ts:240` skips every non-eligible outcome identically —

```ts
if (result.outcome !== "eligible") continue;
```

— nothing is persisted, and the source run record counts only `received_count` and `eligible_count`. A source discarding 95% of its stock is indistinguishable from a source without much UK content.

Fixing the classifier made this more urgent, not less. Unrecognised locations now route to `quarantined` rather than `excluded`, which is the honest outcome, but quarantined jobs are still dropped by that same line. And the classifier's headline measurement — 230 of 230 places publishing — is taken over the gazetteer itself, so it is close to a tautology against real adverts. **Nobody can currently say what fraction of real Greenhouse adverts fail recognition, or which places they name.** That is the question this task exists to answer.

## Design

Two additions to `ingestion_source_runs`, no new table.

### Per-reason counts

`normaliseProviderJob` returns a closed set of three drop reasons, so three columns rather than a general mechanism:

- `excluded_non_uk_count` — a positive foreign signal
- `quarantined_ambiguous_count` — no recognised UK evidence either way
- `quarantined_invalid_url_count` — application URL failed the host allowlist

### Unrecognised locations

`quarantined_ambiguous_count` alone tells an administrator there is a problem and gives them no way to fix it. The location strings are what make it actionable: seeing `Ashby-de-la-Zouch, Leicestershire` twelve times says exactly which places the gazetteer is missing.

These live in an `unrecognised_locations` JSONB column on the run row, **not** in a table of their own. A run already has a row, an admin read, and an RLS boundary; reusing them avoids a table, an upsert RPC, a policy, and a retention question, and an administrator diagnosing a source looks at that source's latest run anyway. The column is capped at 25 distinct strings per run.

The trade is cross-run aggregation — "the top missing towns across all sources this month" needs a query over the JSONB rather than a `group by`. That is a reporting concern, not a blocker, and it can be added when someone actually wants it.

### Why quarantined adverts are not persisted

The earlier handoff said this task needed "persistence for quarantined adverts". It does not. Ingestion is idempotent and re-runs against complete provider snapshots, so a quarantined advert is re-fetched on the next run. What cannot be recovered is *knowing which place names failed*, because that is computed and thrown away. Persist the diagnosis, fix the gazetteer, and the next run publishes the jobs on its own.

This also keeps the change away from the `jobs` table. Storing quarantined adverts there — the obvious alternative — would put non-UK-verified rows one predicate away from every user-facing query, which is the UK-only invariant at risk for a diagnostic feature.

## Scope

`unrecognised_locations` records the location text of adverts quarantined as `ambiguous_uk_eligibility` only. Public advert location strings, no personal data, bounded length, and they never reach a user surface.

## What review found, and why it was not the SQL body

The risky-looking part of this change was the `finish_source_ingestion` body, which was extracted from `202607180003` by script and patched rather than hand-written. Review diffed it line by line and found it faithful — every branch, lock, and audit insert intact.

The damage was one rung above it. **This is the repository's first `drop function`.** Every other migration uses `create or replace`, which *preserves* a function's privileges. `drop` plus `create` does not: the recreated function starts from PostgreSQL's default ACL, which grants `EXECUTE` to `PUBLIC`. The two `revoke ... from public, anon, authenticated` statements that protected this RPC both name the **eleven-argument** signature this migration deletes, so the fifteen-argument replacement was left open to any holder of the anon key — a `security definer` function that bypasses RLS to close live jobs and append audit records.

It was also silent in both available directions. `service_role` is a member of `PUBLIC`, so ingestion kept working and nothing failed at runtime. And `verify-supabase-foundation.mjs` matched the revoke rule on the function *name* with any argument list, so the stale eleven-argument revoke satisfied the check for a function that no longer existed. The guardrail certified it.

Both are fixed: the migration now revokes and grants explicitly, and the verifier compares the position of each revoke against the last `drop function` for that name, so a revoke written before a drop no longer counts. Removing the revoke from the migration now fails `pnpm check:supabase` with a message naming the drop — verified by doing it. pgTAP `022` also asserts directly that `anon` and `authenticated` cannot execute the RPC, which the file had omitted while asserting `is_definer`.

The other finding worth recording: the drop tally was threaded into the per-source cap path, where it is always empty, and *not* into the generic `catch`, where it is full. Anything thrown after normalisation began — a parse failure, an upsert error — finalised with every drop count at zero, erasing the diagnosis on precisely the runs most worth diagnosing.

## Verification

- A run that drops jobs for all three reasons records all three counts, and for adverts that reached normalisation they sum with `eligible_count` to `received_count`. The scoping is load-bearing: the per-source cap returns before the loop, so a capped run legitimately records a received count with no outcomes at all.
- A run that throws after normalisation began still records the breakdown it had accumulated.
- Distinct unrecognised locations are recorded, deduplicated, and capped at 25.
- The counts and locations reach `/admin/ingestion`.
- The fictional development preview shows the new fields without importing a production mutation.
- pgTAP covers the new columns, their constraints, and the extended `finish_source_run`.

# Task 6.2 implementation report

## Outcome

Implemented URL-backed job filters, canonical query strings, matching local-fixture query behaviour, and the RLS-bound Supabase jobs list/detail repository.

## TDD evidence

- Filter RED: `filters.test.ts` failed because `./filters` did not exist.
- Fixture RED: three new assertions failed because fixtures ignored search/category filters, ordering, pagination, and visible last-seen timestamps.
- Supabase RED: repository and selector suites failed because `supabase-jobs` and `get-repository` did not exist.
- GREEN: focused filter, fixture, Supabase, and selector suites passed 33 tests.

### Independent review remediation

Review found that the initial search escaping combined the SQL `ILIKE` literal and PostgREST quoted-value concerns in one pass. That protected PostgREST structure, but PostgREST consumes one backslash layer before PostgreSQL evaluates the `ILIKE` pattern. It also found that a whitespace-only `raw_location` became a blank display location after trimming.

Tests were extended before the fix with distinct comma, parentheses, colon, dot, double-quote, backslash, percent, underscore, combined backslash/percent/underscore, combined hostile-input, and whitespace-only location cases. Fixture tests also confirm that `%`, `_`, and backslash remain literal search text.

RED:

```text
Test Files  1 failed | 1 passed (2)
Tests       6 failed | 26 passed (32)
```

The six expected failures were backslash, percent, underscore, combined escaping, the combined hostile input, and whitespace-only location selection.

The minimal fix now applies two explicit stages: first escape user text as a PostgreSQL `ILIKE` literal, then escape that pattern as a PostgREST double-quoted value. Location mapping trims and removes blank candidates before deterministic selection.

GREEN:

```text
Test Files  2 passed (2)
Tests       32 passed (32)
```

## Boundaries

- The production repository uses the caller cookie-bound Supabase client only; there is no service-role path.
- Queries require active jobs, exact counts, stable `posted_at` then `id` ordering, and 25-row ranges.
- Search text passes through separate SQL `ILIKE` literal and PostgREST quoted-value escape layers before raw OR syntax.
- Returned rows and counts are Zod-validated; provider details are replaced by `Unable to load jobs`.
- Detail lookup validates UUIDs, requires active status, and uses `maybeSingle`.
- The job source table is not joined because approved non-admin users cannot read it under current RLS; detail uses the truthful generic label `External job listing`.
- Local fixtures implement the same search/filter/order/pagination semantics needed for browser acceptance.
- `latestListingUpdate` is the newest `last_seen_at` among the visible result rows, pending the later ingestion-run timestamp work.

## Verification

- Focused tests after review remediation: 4 files, 46 tests passed.
- Final web tests after review remediation: 13 files, 115 tests passed.
- Web lint: passed.
- Web typecheck: passed.
- Prettier: applied and checked by the implementer.
- `git diff --check`: passed.

## Remaining limits

- The live Supabase query is contract-tested with a query-builder double; operational Supabase/OAuth setup remains intentionally deferred.
- UI rendering and browser verification belong to Task 6.3.

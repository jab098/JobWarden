# Task 30 — Lever adapter and provider vocabulary widening

Read with [the roadmap's Tasks 30–32 section](../../product/roadmap.md), [source coverage](../../product/source-coverage.md), and [project status](../../project-status.md).

## Split into 30a and 30b, 2026-07-20

**30a — the adapter. Delivered.** Pure TypeScript, no SQL: the Lever adapter,
its 26 tests, the `JobSource` union, and the package export. Nothing dispatches
to it yet, so it is inert in every running path.

**30b — the vocabulary widening. Not started, and deliberately not started
without Docker.** Measuring it is what forced the split: widening the provider
list means reproducing **850 lines of security-definer SQL** under
`create or replace`, across seven functions.

| Function                              | Lines | Latest definition |
| ------------------------------------- | ----: | ----------------- |
| `public.upsert_ingested_jobs`         |   226 | `202607180003`    |
| `public.claim_ingestion_requests`     |   161 | `202607180003`    |
| `public.upsert_job_source`            |   144 | `202607170003`    |
| `private.rematerialize_canonical_job` |   124 | `202607200003`    |
| `public.request_source_ingestion`     |   111 | `202607180001`    |
| `public.start_source_ingestion`       |    48 | `202607180003`    |
| `public.enqueue_scheduled_ingestion`  |    36 | `202607180003`    |

`upsert_ingested_jobs` bypasses RLS, closes live jobs, and writes audit
records. Task 25c's review found a live `anon`-executable security hole
introduced by exactly this extract-and-patch pattern on exactly these
functions, and the pgTAP privilege assertions that would catch a transcription
slip **have never executed**, because Docker is not installed. Writing 850
lines of definer SQL that cannot be run is how that defect happened once
already.

30b therefore waits for Docker and `pnpm verify:live`. This is not a
scheduling preference; running the SQL is the only check that exists for it.

## Endpoint, confirmed 2026-07-20

`GET https://api.lever.co/v0/postings/{site}?mode=json`, from Lever's own
[postings-api documentation](https://github.com/lever/postings-api). No
authentication, no commercial agreement, no credential. Every Lever customer's
published postings are public by design; the documentation states plainly that
published postings are publicly viewable. Read requests carry no documented
rate limit — only application POSTs do, which JobWarden never issues.

There is an EU host (`api.eu.lever.co`). This slice uses the global host only,
and the source row's `allowed_hosts` is what constrains it.

Fields used, all from the documented response:

| Lever field                   | Use                                                |
| ----------------------------- | -------------------------------------------------- |
| `id`                          | `providerJobId`                                    |
| `text`                        | `title`                                            |
| `categories.location`         | `location` — the classifier's location evidence    |
| `descriptionPlain` / `lists`  | `descriptionHtml`, after the shared sanitiser      |
| `hostedUrl`                   | `absoluteUrl`                                      |
| `applyUrl`                    | `canonicalApplicationUrl`, host-allowlisted        |
| `categories.commitment`       | `employmentType` evidence only                     |
| `salaryRange`                 | `compensation`, provenance `advertised`            |
| `createdAt`                   | `postedAt`                                         |

## Decisions, and why

**`country` is deliberately not used for eligibility in this slice.** Lever
returns an ISO 3166-1 alpha-2 code, so `GB` looks like stronger evidence than
parsed location text. It is not used, for two reasons. Synthesising a location
string such as `"London, United Kingdom"` from it would fabricate evidence the
advert never stated, which is what Task 25a's review caught last time. And
adding a "provider asserts country" input to `classifyUkEligibility` changes
the eligibility contract for *every* provider, which is a separate change
deserving its own review rather than a rider on a new adapter. Lever therefore
supplies `categories.location` as location evidence and the existing reviewed
classifier decides, exactly as Greenhouse does. Using `country` as a genuine
evidence source is a good follow-up; it is not this task.

**IR35 stays `unknown`.** `categories.commitment` may say "Contract". Inferring
IR35 from contract status is forbidden by `AGENTS.md`, so commitment informs
employment type only.

**Compensation provenance is `advertised` or `unknown`, never `estimated`.**
`salaryRange` present and complete means the employer stated it. Absent means
`unknown`, and no figure is invented. `salaryDescription` is free text and is
not parsed into numbers.

**The adapter owns its own transport loop.** Greenhouse and Reed each own one,
sharing only `AdapterError` and `retry.ts`; Reed's differs materially (429
excluded from retry, four concurrent detail calls). Matching that convention
keeps the diff additive. Extracting a shared transport would refactor two
reviewed, security-sensitive adapters as a side effect of adding a third.
Marked with a `ponytail:` comment: if Ashby and Workable also duplicate it,
five copies is where extraction pays, and Greenhouse and Lever are the two with
genuinely identical shape.

**Coverage is `complete`.** One request returns the whole board, so the
existing two-consecutive-omissions closure rule applies as it does to
Greenhouse. Lever is not incremental discovery like Reed.

## The vocabulary widening this slice carries

Tasks 31 and 32 then add a value, an adapter and fixtures. Every site listed in
the roadmap's Tasks 30–32 section, confirmed by grep:

- `job_sources_supported_provider` in `202607180003`, which binds
  `coverage_mode` per provider — Lever is `complete`, like Greenhouse.
- The provider guards in `configure_job_source`, `request_source_ingestion`,
  `begin_source_ingestion` and `enqueue_scheduled_ingestion`, across
  `202607170003`, `202607180002` and `202607180003`.
- The `case source.provider when 'greenhouse' then 0 else 1 end` orderings in
  `202607180003` and `202607200003`.
- `z.enum(["greenhouse", "reed"])` in `supabase/functions/ingest-jobs/repository.ts`.
- The dispatch in `supabase/functions/ingest-jobs/index.ts`.
- The `JobSource` union in `packages/ingestion/src/types.ts`.
- `components/admin/source-form.tsx`, `components/admin/source-list.tsx`,
  `lib/admin/types.ts`, `lib/sources/development-sources.ts`.

**Every widened function uses `create or replace`, never `drop function` plus
`create`.** Task 25c's review found that a drop resets the ACL to PostgreSQL's
default `EXECUTE` to `PUBLIC`, which left a security-definer ingestion function
reachable by the anon key while the static verifier certified it as revoked.
The new migration must also be registered in `verify-supabase-foundation.mjs`,
whose list is chronological by assertion.

## Files

New: `packages/ingestion/src/lever.ts`, `packages/ingestion/src/lever.test.ts`,
`supabase/migrations/202607230001_lever_provider.sql`,
`supabase/tests/023_lever_provider.sql`.

Changed: `types.ts`, `index.ts`, the Edge Function repository and entry point,
the four web modules above, `verify-supabase-foundation.mjs`, and a dated
compliance record in `docs/product/source-coverage.md`.

## Failing tests first

1. A fictional Lever payload normalises to a published UK job.
2. A posting whose location is unrecognised quarantines rather than publishes.
3. A remote posting with no explicit UK permission is not published.
4. `salaryRange` absent yields `unknown` provenance and no figure.
5. `salaryRange` present yields `advertised` with minor-unit precision intact.
6. `commitment: "Contract"` does not set an IR35 status.
7. A malformed payload raises `invalid_response` before any job is trusted.
8. Transient statuses retry within the bounded policy; 4xx does not.
9. An `applyUrl` outside `allowed_hosts` quarantines as an unusable link.
10. The same listing on Lever and Greenhouse reconciles to one canonical record.

## Verification

`pnpm verify`, `pnpm check:supabase`, `pnpm check:production`,
`pnpm audit --prod`, `gitleaks`, `git diff --check`. Once Docker is installed,
`pnpm verify:live` for migration 25 and pgTAP 023 — currently statically
verified only, like every migration before it.

## Rollback

The source ships **disabled**. Nothing reaches users until the owner enables a
Lever source row, so rollback is leaving it disabled or reverting the migration
before any row exists.

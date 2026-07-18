# Task 9 UK Coverage and Compensation Design

## Decision

Task 9 adds Reed's documented Jobseeker API as JobWarden's first broad UK discovery connector, extends the shared runtime to distinguish complete snapshots from incremental discovery, introduces conservative cross-source deduplication with per-source provenance, and makes compensation provenance visible and filterable.

The connector is implemented and fixture-tested without a real key. It remains disabled in hosted environments until the owner registers a Reed API key, records the applicable terms/attribution/retention decision, and completes the existing live Supabase gate. LinkedIn, Indeed, and Glassdoor remain explicit coverage targets but are not scraped.

## Source choice

### Chosen: Reed Jobseeker API

Reed documents credentialed job search and job-detail endpoints intended for building job-search experiences. Its fields directly cover UK location, permanent/contract/temporary status, full-time/part-time status, salary range, salary period, expiry, and canonical Reed/external application URLs. That makes it the highest-value first connector for the owner's stated contract, part-time, and compensation needs.

The adapter uses Basic authentication with the API key as username and an empty password. The key exists only in the Edge Function environment as `REED_API_KEY`; it is never stored in `job_sources`, URLs, migrations, logs, audit metadata, or client code.

### Deferred: Adzuna

Adzuna is technically efficient and broad, but its current default organisational terms allow a 14-day evaluation and state that ongoing work may require written consent or a licence. It remains `permission_required` until the owner has a durable agreement and can satisfy its visual attribution/removal requirements.

### Blocked from scraping

LinkedIn requires express crawling permission; Indeed requires an authorised feed or written permission; Glassdoor requires controlled API/written access. Their status remains visible in `docs/product/source-coverage.md` and administrator coverage reporting.

## Runtime source contract

`JobSource` becomes a discriminated union:

- `greenhouse`: a complete per-employer board snapshot using `boardToken`;
- `reed`: one global GB incremental source using the fixed source key `gb-discovery`.

`ProviderAdapter.fetchJobs` returns `{ jobs, coverage }`, where `coverage` is `complete` or `incremental`. Greenhouse returns `complete`. Reed returns `incremental` because a bounded newest-results window cannot prove that every older live Reed advert is absent.

An incremental successful run is still a successful run, updates freshness, and completes its queue request, but never increments omission counters. A failed or capped run also never increments omissions. Complete Greenhouse snapshots retain the existing two-consecutive-successful-omissions rule.

Reed search/detail traffic is bounded to 50 newest results per run, four detail requests in flight, the existing three attempts, and the Edge Function's abort deadline. A 429 is a source failure with no paid or alternate fallback. The source minimum interval is at least six hours unless a later written provider allowance explicitly permits more.

## Removal and lifecycle

Reed details include an expiry date. Reed jobs store `closes_at`, and the database lifecycle function closes canonical jobs only when every active source occurrence is either:

- explicitly expired by its source-provided `closes_at`; or
- closed after two complete successful omissions from an authoritative snapshot source.

An incremental page omission is never evidence of closure. A scheduled maintenance step inside the bounded queue claim transaction expires at most the claim limit per call, avoiding unbounded cleanup.

## Conservative deduplication and provenance

`jobs` remains the canonical record read by the product. A new `job_source_occurrences` table stores each provider/source identity, canonical job link, source URL, content hash, source-provided close time, last-seen source run, lifecycle, and omission counter.

Every incoming job has a `deduplicationKey`:

- when the provider supplies a validated external canonical application URL, hash its normalised HTTPS URL after removing fragments and known tracking parameters;
- otherwise hash `provider + source + provider job id`, which intentionally cannot merge across sources.

The database reuses a canonical job only when the exact deduplication key matches. It never fuzzy-merges by title, employer, location, or description. This sacrifices some recall to avoid joining unrelated vacancies. Each occurrence remains queryable, so canonicalisation never loses source provenance.

Canonical display data uses deterministic precedence:

1. advertised compensation over estimated over unknown;
2. a direct employer occurrence over an aggregator occurrence when explicitly identified;
3. otherwise the most recently seen occurrence.

Task 9 implements Reed as an aggregator and existing Greenhouse sources as direct employer occurrences.

## Compensation provenance

Every normalised and stored job includes:

- `compensationProvenance`: `advertised`, `estimated`, or `unknown`;
- raw text, GBP minimum/maximum, and period;
- `compensationObservedAt` for advertised source data;
- optional estimation method, confidence, and estimate date for future estimates.

Task 9 does not invent estimates. Structured Reed salary fields and explicit GBP ranges in visible job text are `advertised`; absent or unsafe values are `unknown`. The `estimated` state is implemented in schema/UI so a future reviewed estimator cannot masquerade as advertised pay.

The jobs feed adds a compensation provenance filter with `all`, `advertised`, `estimated`, and `unknown`. Unknown jobs remain included by default. Job cards/details label provenance explicitly; salary remains a filter and fact, never a score booster.

## Source health and measured coverage

Administrator ingestion reporting adds provider/source health facts derived from bounded database queries:

- last successful run and freshness state;
- last run status and sanitised error code;
- active canonical occurrence count;
- advertised/estimated/unknown compensation counts;
- permanent, contract, temporary, full-time, and part-time counts;
- incremental versus snapshot coverage mode.

The UI says “indexed coverage”, never “all UK jobs”. Known connector-access gaps remain documented even when their count is unavailable.

## Database and security boundaries

- Provider values are restricted to `greenhouse` and `reed` at mutation and runtime boundaries.
- Reed keys are environment-only and validated without exposing their value.
- RLS remains forced on canonical jobs and the new occurrence table.
- Approved users may read active canonical jobs and their non-secret source attribution; only service-role ingestion functions mutate occurrences.
- No source credentials, raw provider errors, full payloads, or untrusted descriptions enter logs/audit metadata.
- Application links remain manual HTTPS links.

## Operations and owner setup

No owner input is needed for fixture implementation. To activate Reed later, the owner must:

1. register through Reed's Jobseeker API developer page;
2. retain the issued API key in the password manager;
3. confirm the current terms, attribution, retention, cadence, and private-beta use are acceptable;
4. add `REED_API_KEY` only to Supabase Edge Function secrets;
5. create a disabled Reed source with the exact compliance record;
6. run Docker-backed migrations/pgTAP and one bounded live smoke test;
7. enable the source only after counts, links, provenance, and 429 behaviour pass.

## Verification

- Adapter tests cover authentication, paging/detail bounds, schema rejection, dates, structured compensation, aborts, retries, and secret redaction.
- Normalisation tests cover explicit UK evidence, provider overrides, canonical URL identity, advertised/unknown provenance, and unsafe external URLs.
- Handler/repository tests cover provider dispatch, missing credentials, incremental success, transactional occurrence batches, and isolation.
- pgTAP covers provider restrictions, occurrence RLS/grants, exact-key deduplication, source provenance, incremental non-omission, complete two-run omission, expiry closure, and compensation constraints.
- Web tests cover default inclusion of unknown compensation, all provenance filters, truthful labels, and source-health counts.
- Full verification includes Deno graph checking, static Supabase checks, production build, dependency audit, exact-range secret scan, and independent review.

## Non-goals

- no LinkedIn, Indeed, or Glassdoor scraping;
- no Adzuna activation without durable permission;
- no fuzzy/AI deduplication;
- no salary estimation model;
- no currency or period conversion;
- no per-user crawling;
- no pricing, payment, subscription, or auto-apply features.

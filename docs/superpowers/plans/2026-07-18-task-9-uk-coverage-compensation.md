# Task 9 UK Coverage and Compensation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lawful credentialed Reed discovery connector, conservative canonical deduplication with retained source provenance, and truthful compensation/source-health visibility.

**Architecture:** Extend the existing provider adapter contract with complete/incremental coverage and structured provider facts. Persist incoming jobs through one service-role transactional batch that maintains canonical `jobs` plus RLS-protected `job_source_occurrences`; only complete snapshots advance omissions. Extend the existing jobs/admin repositories rather than adding another web data path.

**Tech Stack:** TypeScript, Zod, Vitest, Deno/Supabase Edge Functions, PostgreSQL/pgTAP, Next.js App Router, existing shadcn primitives.

## Global Constraints

- UK eligibility must remain explicit; remote alone is never UK evidence.
- Reed uses the documented API only, with environment-only credentials and a six-hour minimum cadence.
- Incremental source omissions never close jobs.
- Deduplication is exact canonical-URL identity only; no fuzzy title/employer merge.
- Compensation provenance is always advertised, estimated, or unknown; Task 9 creates no estimates.
- Unknown compensation remains included by default and filterable.
- No LinkedIn, Indeed, or Glassdoor scraping; Adzuna remains permission-gated.
- No pricing, payments, subscriptions, auto-apply, real personal data, or automatic paid fallback.

---

### Task 1: Provider-neutral domain and Reed adapter

**Files:**
- Modify: `packages/domain/src/job.ts`
- Modify: `packages/domain/src/compensation.ts`
- Modify: `packages/domain/src/job.test.ts`
- Modify: `packages/domain/src/compensation.test.ts`
- Modify: `packages/ingestion/src/types.ts`
- Create: `packages/ingestion/src/reed.ts`
- Create: `packages/ingestion/src/reed.test.ts`
- Modify: `packages/ingestion/src/index.ts`
- Modify: `packages/ingestion/src/normalise.ts`
- Modify: `packages/ingestion/src/normalise.test.ts`

**Interfaces:**
- Produces `ProviderFetchResult`, provider-discriminated `JobSource`, `ProviderCompensation`, `compensationProvenance`, `deduplicationKey`, and `ReedAdapter`.
- Reed returns at most 50 detailed jobs and `coverage: "incremental"`; Greenhouse returns `coverage: "complete"`.

- [x] Write failing domain tests for compensation provenance and canonical deduplication key fields.
- [x] Run focused domain tests and confirm schema failures.
- [x] Implement the minimal schema/parser changes and rerun to green.
- [x] Write failing Reed adapter tests for Basic auth, bounded results/detail concurrency, explicit fields, retries, abort, malformed payload, and redacted errors.
- [x] Run the focused Reed tests and confirm `ReedAdapter` is missing.
- [x] Implement the adapter with the existing retry primitives and rerun to green.
- [x] Write failing normalisation tests for structured Reed facts, exact canonical URL keys, unsafe external URLs, and incremental coverage.
- [x] Implement provider-fact precedence without weakening visible-text or UK classification boundaries.
- [x] Run domain and ingestion suites, typecheck, and commit `feat: add Reed ingestion adapter`.

### Task 2: Canonical jobs, source occurrences, and lifecycle migration

**Files:**
- Create: `supabase/migrations/202607180003_uk_coverage_compensation.sql`
- Create: `supabase/tests/006_uk_coverage_compensation.sql`
- Modify: `scripts/verify-supabase-foundation.mjs`
- Modify: `scripts/verify-supabase-foundation.test.ts`

**Interfaces:**
- Produces `public.job_source_occurrences`, compensation provenance columns, `coverage_mode`, provider-safe source constraints, bounded expiry maintenance, and revised batch/finalisation RPCs.
- Existing `jobs` reads remain valid; occurrence mutations remain service-role-only.

- [ ] Write failing static-verifier tests requiring migration 6, forced RLS, exact-key occurrence uniqueness, Reed provider support, incremental non-omission, provenance constraints, and bounded expiry.
- [ ] Run the verifier tests and confirm all new fragments are missing.
- [ ] Write the migration and pgTAP behavioural specification, including a migration of every existing job into one occurrence.
- [ ] Update the static verifier minimally and rerun to green.
- [ ] Confirm pgTAP plan count matches the exact assertion count and run `git diff --check`.
- [ ] Commit `feat: add canonical job provenance model`.

### Task 3: Edge runtime dispatch and transactional persistence

**Files:**
- Modify: `supabase/functions/_shared/env.ts`
- Modify: `supabase/functions/_shared/env.test.ts`
- Modify: `supabase/functions/ingest-jobs/contracts.ts`
- Modify: `supabase/functions/ingest-jobs/handler.ts`
- Modify: `supabase/functions/ingest-jobs/handler.test.ts`
- Modify: `supabase/functions/ingest-jobs/repository.ts`
- Modify: `supabase/functions/ingest-jobs/repository.test.ts`
- Modify: `supabase/functions/ingest-jobs/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes Task 1 provider contracts and Task 2 RPCs.
- Produces environment-only `REED_API_KEY` dispatch, incremental-success finalisation, and occurrence-aware batch payloads.

- [ ] Write failing environment tests proving Reed credentials are optional globally, required only for Reed work, bounded, and never present in errors.
- [ ] Write failing handler tests for Reed dispatch, missing-key source isolation, incremental success, and later Greenhouse continuation.
- [ ] Write failing repository tests for the new occurrence-aware batch and coverage finalisation parameters.
- [ ] Implement the minimal runtime changes and rerun all function tests.
- [ ] Run `pnpm typecheck:functions` and `pnpm check:deno`.
- [ ] Commit `feat: connect Reed to shared ingestion`.

### Task 4: Compensation filters and source-health visibility

**Files:**
- Modify: `apps/web/src/lib/jobs/types.ts`
- Modify: `apps/web/src/lib/jobs/filters.ts`
- Modify: `apps/web/src/lib/jobs/filters.test.ts`
- Modify: `apps/web/src/lib/jobs/supabase-jobs.ts`
- Modify: `apps/web/src/lib/jobs/supabase-jobs.test.ts`
- Modify: `apps/web/src/components/jobs/jobs-filter-fields.tsx`
- Modify: `apps/web/src/components/jobs/job-card.tsx`
- Modify: `apps/web/src/components/jobs/job-detail-view.tsx`
- Modify: `apps/web/src/components/jobs/jobs-ui.test.tsx`
- Modify: `apps/web/src/lib/admin/types.ts`
- Modify: `apps/web/src/lib/admin/supabase-admin-repository.ts`
- Modify: `apps/web/src/lib/admin/supabase-admin-repository.test.ts`
- Modify: `apps/web/src/components/admin/ingestion-run-list.tsx`
- Modify: `apps/web/src/components/admin/admin-ui.test.tsx`

**Interfaces:**
- Produces URL-backed `compensation=all|advertised|estimated|unknown`, explicit provenance labels, and bounded source-health aggregates.

- [ ] Write failing filter/repository tests proving unknown is included by default and each provenance filter generates the correct server query.
- [ ] Implement filter parsing/querying and rerun to green.
- [ ] Write failing component tests for truthful provenance labels and keyboard/mobile-safe filter controls.
- [ ] Implement the existing-design-system UI without adding a new visual language.
- [ ] Write failing admin repository/component tests for freshness, coverage mode, compensation mix, and work-pattern counts.
- [ ] Implement bounded source-health reads and UI, then rerun the web suite and accessibility tests.
- [ ] Commit `feat: expose compensation and source coverage`.

### Task 5: Compliance documentation, full verification, and delivery

**Files:**
- Modify: `docs/product/source-coverage.md`
- Modify: `docs/architecture/free-tier-services.md`
- Create: `docs/operations/reed-ingestion.md`
- Modify: `docs/project-status.md`
- Modify: `docs/product/roadmap.md`
- Create: `docs/reviews/task-9-uk-coverage-compensation.md`

**Interfaces:**
- Produces the permanent Reed setup/disable/removal runbook and Task 10 handoff.

- [ ] Record dated official endpoint, key, cadence, retention, attribution, termination/removal, and named-board access decisions with direct sources.
- [ ] Add exact owner setup steps without requesting the key in chat or storing it in Git.
- [ ] Run frozen install, formatting, lint, all typechecks, Deno graph, all tests, guardrails, static Supabase verification, production build, both audits, diff check, and exact-range Gitleaks.
- [ ] Run real `supabase db reset` and pgTAP if Docker is available; otherwise preserve the explicit pre-live blocker.
- [ ] Request independent full-range review and remediate every Critical, Important, and Minor finding through test-first commits.
- [ ] Publish a ready PR, merge it to GitHub `main`, update local `main`, and rerun frozen verification on the merge commit.

# Task 8 Shared Ingestion Runtime Implementation Plan

> Execute with the worktree, test-driven-development, verification-before-completion, independent-review, and pull-request delivery rules in `AGENTS.md`.

**Goal:** Connect the reviewed Greenhouse ingestion package to one secure, idempotent, globally bounded Supabase queue and weekday scheduler.

**Architecture:** Supabase Cron calls a thin Edge Function using a Vault-backed bearer secret. Service-role-only RPCs enqueue due scheduled sources, recover expired leases, atomically claim requests, and complete them. The function claims one request immediately before processing it, repeats at most four times, and runs the reviewed adapter/normaliser and existing atomic job RPCs per source so every failure remains isolated without leasing untouched work.

**Tech stack:** TypeScript, Vitest, Zod, Supabase JS, Supabase Edge Functions (Deno), PostgreSQL/pgTAP, pg_cron, pg_net, Supabase Vault.

## Permanent boundaries

- UK eligibility remains explicit and is still enforced by `@jobwarden/ingestion` plus database constraints.
- Only allowlisted public source adapters may run; Task 8 adds no scraping or application submission.
- At most four sources and 500 received jobs per invocation; three queue attempts; five-minute leases.
- Failed or incomplete sources never finalise omissions.
- No project URL, API key, cron secret, board token, payload, description, or personal data in logs or source control.
- No paid dependency or automatic overage path.
- Docker-backed Supabase verification remains a pre-deployment gate if Docker is still unavailable.

## Phase 1 — Runtime contracts and failing tests

**Files:**

- Create: `supabase/functions/ingest-jobs/contracts.ts`
- Create: `supabase/functions/ingest-jobs/handler.test.ts`
- Create: `supabase/functions/ingest-jobs/vitest.config.ts`
- Modify: `vitest.workspace.ts`

1. Add tests proving only `POST` is accepted and missing/invalid bearer secrets have one `401` response.
2. Add tests proving valid credentials enqueue scheduled work before claiming, invalid London slots do not enqueue, and claims remain globally capped.
3. Add tests proving one source failure does not abort another, incomplete/capped responses never report success, and every claimed request is completed or safely left to lease recovery.
4. Add tests proving repeated normalised jobs flow through the existing upsert contract, counts are bounded, and logs expose only the approved structured fields.
5. Run the focused Vitest command and capture the expected failure before implementation.

## Phase 2 — Pure handler and provider orchestration

**Files:**

- Create: `supabase/functions/ingest-jobs/handler.ts`
- Create: `supabase/functions/ingest-jobs/errors.ts`

1. Implement constant-work digest comparison, method/body bounds, and environment-independent dependency injection.
2. Implement London weekday-slot detection with an injected clock.
3. Claim one queue row immediately before running `GreenhouseAdapter` plus `normaliseProviderJob`, repeating sequentially up to the four-source invocation cap.
4. Validate normalised jobs again, call atomic upsert/finalisation methods, sanitise error codes, and continue after individual failures.
5. Emit aggregate JSON containing only invocation correlation ID, status, and counts.
6. Run focused tests to green and commit the pure runtime slice.

## Phase 3 — Service-role repository and Edge Function entry point

**Files:**

- Create: `supabase/functions/_shared/env.ts`
- Create: `supabase/functions/_shared/supabase.ts`
- Create: `supabase/functions/ingest-jobs/repository.ts`
- Create: `supabase/functions/ingest-jobs/repository.test.ts`
- Create: `supabase/functions/ingest-jobs/index.ts`
- Create: `supabase/functions/ingest-jobs/deno.json`
- Create: `supabase/functions/tsconfig.json`
- Modify: `supabase/config.toml`
- Modify: `package.json`

1. Test lazy environment validation, Supabase RPC names/parameters, database error redaction, and database-to-runtime row validation.
2. Create one non-persistent service-role client per invocation with session persistence disabled.
3. Map `enqueue_scheduled_ingestion`, `claim_ingestion_requests`, the bounded transactional `upsert_ingested_jobs` batch wrapper, `finish_source_ingestion`, and `complete_ingestion_request` to the handler repository.
4. Add the Deno entry point and function configuration without importing server secrets into the web application.
5. Add focused function typecheck/test scripts and run them to green.

## Phase 4 — Queue, leases, scheduler, and pgTAP

**Files:**

- Create: `supabase/migrations/202607180002_shared_ingestion_runtime.sql`
- Create: `supabase/tests/005_shared_ingestion_runtime.sql`
- Modify: `scripts/verify-supabase-foundation.mjs`
- Modify: `scripts/verify-supabase-foundation.test.ts`

1. First extend the static verifier and tests so the missing fifth migration/RPC/secret-safe schedule fails.
2. Extend `ingestion_requests` with trigger, lease, attempt, run, and sanitised error state while retaining forced RLS and active-source coalescing.
3. Add service-role-only scheduled enqueue, atomic bounded claim with expired-lease recovery, and completion RPCs. Reuse the existing atomic start/upsert/finish functions.
4. Enable Vault, pg_net, and pg_cron. Add a private London-slot HTTP invoker and the eight-candidate UTC weekday cron expression with no literal URL or secret.
5. Add pgTAP assertions for grants, coalescing, cooldown, claim cap, trigger parity, disabled-source cancellation, completion, retry recovery, and omission safety.
6. Run static tests. If Docker is available, run reset and all pgTAP tests; otherwise record the same explicit deployment blocker already carried by Tasks 4 and 7.

## Phase 5 — Operations and durable handoff

**Files:**

- Create: `docs/operations/ingestion.md`
- Modify: `docs/architecture/free-tier-services.md`
- Modify: `docs/project-status.md`
- Modify: `docs/product/roadmap.md`
- Create after review: `docs/reviews/task-8-shared-ingestion-runtime.md`

1. Document local fixture verification and exact live setup without secret values.
2. Document pause/resume, queue inspection, failed-source retry, lease recovery, quota exhaustion, Vault/function-secret rotation, rollback, and incident recovery.
3. Record the current official Supabase limits checked on 2026-07-18: 500,000 monthly free Edge Function invocations; Cron recommendation of no more than eight concurrent jobs and ten minutes per job; current hosted Edge Function resource limits must be rechecked before deployment.
4. Update project status as active during implementation and reviewed only after independent review.

## Phase 6 — Verification, review, and publication

1. Run focused runtime tests/typecheck and static Supabase verification.
2. Run `pnpm verify`, production dependency audit, Gitleaks on the exact branch range, and `git diff --check`.
3. Obtain an independent full-diff review. Remediate every critical, important, and minor finding and re-run proportional/full verification.
4. Commit, push `codex/task-8-ingestion-runtime`, open a pull request, merge to GitHub `main`, update local `main`, and repeat frozen install plus `pnpm verify` on the merge commit.
5. Mark Task 8 reviewed and Task 9 next only after the merge evidence is confirmed.

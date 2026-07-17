# Task 4 Implementation Report — Secure Supabase Data Model

## Status

Implementation is complete with concerns. The tracked JavaScript tests, workspace verification, static SQL security checks, and a local PostgreSQL-compatible fallback all pass. The actual Supabase migration reset and pgTAP suite could not run because Docker is not installed. Therefore this report does **not** claim that the migrations or pgTAP suite pass on Supabase, and does **not** claim that the database foundation is deployable.

No Docker installation, remote database, deployment, push, pull request, authentication UI, job-feed UI, Edge Function, schedule, payment code, application automation, scraper, or additional provider adapter was added.

## Files

Created:

- `supabase/config.toml`
- `supabase/migrations/202607170001_foundation.sql`
- `supabase/migrations/202607170002_rls_and_functions.sql`
- `supabase/migrations/202607170003_audit_and_ingestion.sql`
- `supabase/tests/001_access_rls.sql`
- `supabase/tests/002_jobs_rls.sql`
- `supabase/tests/003_ingestion.sql`
- `supabase/seed.sql`
- `scripts/bootstrap-admin.mjs`
- `scripts/bootstrap-admin.test.ts`
- `scripts/verify-supabase-foundation.mjs`
- `scripts/verify-supabase-foundation.test.ts`
- `.superpowers/sdd/task-4-report.md`

Updated:

- `package.json`
- `pnpm-lock.yaml`

## Schema and constraints

The private schema contains the singleton `private.app_settings` row. It is not exposed through the public Data API schema and grants no direct browser or service-role access.

The public schema contains:

- `profiles`
- `access_requests`
- `user_roles`
- `audit_log`
- `job_sources`
- `jobs`
- `job_locations`
- `ingestion_runs`
- `ingestion_source_runs`

All identifiers use UUIDs and all event timestamps use `timestamptz`. The schema includes:

- access-state checks matching `pending`, `approved`, `rejected`, and `suspended`;
- employment, working-time, workplace, IR35, and compensation-period checks matching the domain package;
- `(source_id, provider_job_id)` uniqueness;
- GB-only country enforcement;
- HTTPS application-link enforcement;
- nonnegative successful-omission counters;
- SHA-256-shaped lowercase content-hash checks;
- compensation range checks;
- source compliance/review fields and host allowlists;
- feed, filter, access-request, ingestion-run, source-run, and location indexes;
- a partial unique index that prevents two persisted `running` source runs for one source.

The `job_sources.provider` column remains extensible text. The current administrator mutation and ingestion boundaries reject anything except `greenhouse`, so unimplemented providers cannot be activated through the supported functions. `board_token` is selectable only by an administrator through RLS or by the server-only `service_role`; it is not treated as cron authentication. No cron secret is stored in a source row.

## Identity, RLS, and policies

`private.handle_new_user()` is an `auth.users` trigger function. When private-beta requests are enabled, it creates only:

- a profile using `coalesce(new.raw_user_meta_data ->> 'full_name', 'JobWarden user')` as display text;
- a `pending` access request;
- a redacted `access.requested` audit event.

It never creates approved access or an administrator role and never uses user metadata for authorisation.

RLS is both enabled and forced on all nine public tables. Policies provide:

- own-profile and own-access-state reads;
- administrator reads across profiles, access requests, roles, audit, sources, jobs, locations, and ingestion data;
- the exact required active-jobs policy for approved users;
- active-job location reads for approved users;
- no direct authenticated mutation policy for jobs, roles, audit rows, access decisions, sources, or ingestion rows.

`public.has_approved_access()` and `public.is_admin()` are stable SQL `security definer` helpers with an empty `search_path`, schema-qualified table references, revoked `public`/`anon` execution, and execute grants only to `authenticated`.

Every other `security definer` function also sets `search_path = ''`, uses schema-qualified data references, revokes `public` and `anon`, and has only its narrow intended grant. The browser never receives or references the service-role key.

## Transactional mutation functions

Administrative authenticated functions:

- `public.get_access_requests_enabled()` returns only the private-beta request flag, requires `is_admin()`, and exposes no direct private-schema table access.
- `public.decide_access_request(uuid, text, text)` locks the request, requires `is_admin()`, enforces the exact domain transition matrix and a trimmed 3–500 character reason, updates decision fields, and writes a redacted audit event in the same transaction.
- `public.set_access_requests_enabled(boolean)` locks and updates the private singleton and writes an audit event in the same transaction.
- `public.upsert_job_source(...)` requires `is_admin()`, accepts only the implemented Greenhouse boundary, validates source safety/compliance inputs, upserts by provider/board identity, and writes an audit event without the board token.

Service-role-only ingestion functions:

- `public.start_source_ingestion(uuid, text)` validates the enabled Greenhouse source, obtains a transaction-scoped advisory lock derived from the source UUID, and creates a parent/source-run pair atomically.
- `public.upsert_ingested_job(...)` locks the source run and source advisory key, accepts data through database constraints, upserts by provider identity, preserves content fields for an unchanged hash, resets seen-job omissions, and emits audit rows only for inserted or changed content.
- `public.finish_source_ingestion(...)` locks the source run and source advisory key, validates counts and a sanitised error code, increments omissions only for a complete successful response, closes active jobs at exactly two successful omissions, never ages jobs for failed or incomplete runs, finalises counts/status, updates last-successful-sync only for a complete success, and audits the final outcome atomically.

Audit rows have no authenticated update/delete grants and also have a defensive trigger that rejects all updates and deletes, including privileged callers. Ingestion functions never delete jobs.

## Administrator bootstrap

`scripts/bootstrap-admin.mjs`:

- requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_BOOTSTRAP_USER_ID`;
- validates a UUID and does not accept an email address;
- creates a non-persisting server-only Supabase client;
- fetches exactly that identity with `auth.admin.getUserById`;
- requires a confirmed email or a non-email external identity with verified email evidence;
- rejects an unexpected returned identity;
- invokes only the service-role `public.bootstrap_admin(uuid)` RPC after the identity precheck;
- prints only `Administrator bootstrap complete.`;
- prints only a generic failure in CLI mode.

The database RPC independently verifies the exact `auth.users` UUID and a confirmed email or verified non-email `auth.identities` row, inserts the idempotent administrator role, and writes `admin.bootstrap` in one PostgreSQL transaction. It is a hardened `security definer` function with `search_path = ''`, revoked `public`/`anon`/`authenticated` execution, and an execute grant only to `service_role`. Direct service-role inserts into `user_roles` and `audit_log` are not granted.

Tests inject a fake Supabase client and cover all required missing variables, invalid UUIDs, exact lookup, unverified identity, confirmed external identity, one-RPC idempotent reruns, atomic-RPC failure, audit writes, and output/metadata redaction. pgTAP and PGlite fallback coverage additionally force an audit insert failure and assert that the role insert rolls back.

## TDD evidence

### pgTAP test-first ordering and blocked runtime

After `pnpm dlx supabase@latest init` returned `Finished supabase init.`, all three pgTAP files were created before any migration file.

First database-test attempt, with tests present and migrations absent:

```text
$ pnpm dlx supabase@latest db test
Connecting to local database...
failed to connect to postgres: failed to connect to `host=127.0.0.1 user=postgres database=postgres`: dial error (dial tcp 127.0.0.1:54322: connect: connection refused)
```

Prerequisite evidence:

```text
$ docker --version
zsh:1: command not found: docker

$ pnpm dlx supabase@latest start
failed to inspect service: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
Docker Desktop is a prerequisite for local development.
```

Because Docker is unavailable, runtime pgTAP RED and GREEN could not be witnessed. Test-first ordering is preserved; the suite remains ready for the required real run.

### JavaScript bootstrap and static verifier RED

The first focused run failed because both implementations were missing:

```text
$ pnpm vitest run scripts/bootstrap-admin.test.ts scripts/verify-supabase-foundation.test.ts
Test Files  2 failed (2)
Error: Cannot find module './bootstrap-admin.mjs'
Error: Cannot find module './verify-supabase-foundation.mjs'
```

Minimal not-implemented stubs were then added so the tests could execute and fail on behavior rather than module loading:

```text
Test Files  2 failed (2)
Tests  11 failed (11)
Expected: "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL"
Received: "Administrator bootstrap is not implemented"
```

### JavaScript bootstrap and static verifier GREEN

```text
$ pnpm vitest run scripts/bootstrap-admin.test.ts scripts/verify-supabase-foundation.test.ts
Test Files  2 passed (2)
Tests  11 passed (11)

$ node scripts/verify-supabase-foundation.mjs
Supabase foundation static verification passed (3 migrations, 9 forced-RLS tables).
```

The tracked static verifier checks required migrations, all forced-RLS tables, the exact jobs policy, core constraints/indexes and domain vocabularies, private settings/identity creation, the supported-provider boundary, audit immutability, advisory locking, omission gating, security-definer search paths/revocations, and the absence of forbidden browser mutation policies.

## Docker-free PostgreSQL fallback

As supplementary evidence, a temporary PGlite 0.5.4 PostgreSQL-compatible runtime was initialised with minimal local `auth` schema/role stubs. It applied the three migrations in order after skipping only the `create extension pgcrypto` declaration, because that extension is unavailable in PGlite. The migration body, tables, RLS, policies, triggers, and PL/pgSQL functions were executed.

The first application caught a real PL/pgSQL syntax error in the access transition `CASE`; that was fixed, and the rerun applied all three migrations. The behavioral fallback then checked pending/suspended/approved/admin job visibility, idempotent provider identity, unchanged-content preservation, failure/incomplete-run omission safety, and two-omission closure:

```text
$ node /tmp/jobwarden-pglite.0ro6c0/verify-foundation.mjs
PGlite fallback: migrations applied; RLS and ingestion assertions passed.
```

This is not Supabase and does not replace `supabase db reset` or pgTAP.

## Final verification

Passing checks:

```text
$ pnpm vitest run scripts/bootstrap-admin.test.ts scripts/verify-supabase-foundation.test.ts
Test Files  2 passed (2)
Tests  11 passed (11)

$ pnpm check:supabase
Supabase foundation static verification passed (3 migrations, 9 forced-RLS tables).

$ pnpm test
Test Files  8 passed (8)
Tests  177 passed (177)

$ pnpm verify
exit 0
format: clean
lint: clean
typecheck: clean
workspace tests: 177 passed
guardrails: passed
Next.js production build: compiled successfully

$ git diff --check
exit 0

$ pnpm audit --audit-level high
exit 0
1 moderate vulnerability, 0 high, 0 critical

$ gitleaks git . --no-banner --redact
21 commits scanned
no leaks found

$ gitleaks git . --staged --no-banner --redact
scanned ~101013 bytes
no leaks found
```

`pnpm audit --json` identifies the moderate issue as the pre-existing `apps__web>next>postcss` path (`GHSA-qx2v-qp2m-jg93`, fixed by PostCSS 8.5.10 or later). It is outside Task 4's database scope and no high/critical issue is present.

A full working-directory gitleaks scan reported six generated Next.js preview/encryption values under ignored `apps/web/.next` build output. It reported no intended source or migration file; the subsequent staged-file scan was clean.

Blocked required checks:

```text
$ pnpm dlx supabase@latest db reset
exit 1
failed to inspect service: Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Docker Desktop is a prerequisite for local development.

$ pnpm dlx supabase@latest db test
exit 1
failed to connect to postgres at 127.0.0.1:54322: connection refused

$ pnpm dlx supabase@latest db lint --local
exit 1
PgClient: Failed to connect
```

The Next.js build also emits its existing worktree warning about multiple lockfiles/workspace-root inference, but the production build completes successfully.

## Self-review

- Scope: no Task 5+ UI, auth routes, Edge Functions, schedules, deployments, or extra adapters were added.
- UK/data constraints: the database matches the established domain constants and enforces `GB` and HTTPS at the final boundary.
- Private beta: identity creation produces pending state only; approval and administrator status remain server-controlled.
- Source safety: source records contain compliance metadata; unsupported providers fail closed at current mutation/ingestion boundaries; no cron credential is stored.
- RLS: all public tables are enabled and forced; authentication alone does not grant jobs; direct browser mutations are absent.
- Definer safety: every security-definer function has empty search path, qualified data references, public/anon revocation, and a narrow grant.
- Atomicity: administrative decisions/settings/source writes, job upserts, omission finalisation, run failure handling, and audit events occur inside their respective database function transaction.
- Staleness: only complete successful source runs increment omissions; seen jobs reset; one omission stays active; two close; failed/incomplete runs do not age jobs.
- Audit: authenticated update/delete privileges are absent and a defensive immutable trigger protects privileged paths.
- Bootstrap: exact UUID, verified identity, idempotent role write, audit event, and redacted output are covered by focused tests.
- Secrets: no real secret was added; service-role use exists only in the local bootstrap script's server-side environment variable.

## Concerns and required follow-up

1. Docker is absent. The migrations have not been applied by Supabase CLI and the pgTAP suite has not executed. Run `pnpm dlx supabase@latest db reset` and `pnpm dlx supabase@latest db test` in an environment with Docker before calling the foundation deployable.
2. The PGlite fallback skipped the `pgcrypto` extension declaration and used minimal local `auth.users`/role stubs. It materially improves syntax/behavior confidence but is not parity evidence for Supabase Auth, PostgREST grants, or pgTAP.
3. `pnpm audit` reports one pre-existing moderate PostCSS advisory through Next.js; it is not introduced by Task 4 but remains repository debt.
4. The normal Next.js build succeeds with an existing workspace-root/multiple-lockfile warning in this linked worktree.

## Review remediation follow-up

The post-implementation review identified three concrete gaps, all addressed in the follow-up commit:

1. Administrator bootstrap now uses one service-role-only transactional database function. The script keeps its exact identity/verification preflight, then calls only `rpc("bootstrap_admin", { target_user_id })`. The database repeats exact UUID and verified identity checks, performs role plus audit writes atomically, and has no browser execution grant.
2. `job_sources.allowed_hosts` now rejects SQL `NULL` array elements at the table constraint and the administrator mutation function rejects them before writing. Empty arrays and invalid host syntax remain rejected.
3. `public.get_access_requests_enabled()` is the narrow administrator-only getter for `private.app_settings`; non-administrators receive `42501 administrator required` and no private table is directly exposed.

Review-fix TDD RED:

```text
$ pnpm vitest run scripts/bootstrap-admin.test.ts scripts/verify-supabase-foundation.test.ts
Test Files  2 failed (2)
Tests  5 failed | 8 passed (13)
TypeError: supabase.from is not a function
missing atomic service-role administrator bootstrap function

$ pnpm dlx supabase@latest db test
exit 1: local PostgreSQL connection refused because Docker is unavailable
```

Review-fix GREEN and final checks:

```text
$ pnpm vitest run scripts/bootstrap-admin.test.ts scripts/verify-supabase-foundation.test.ts
Test Files  2 passed (2)
Tests  13 passed (13)

$ pnpm check:supabase
Supabase foundation static verification passed (3 migrations, 9 forced-RLS tables).

$ node /tmp/jobwarden-pglite.0ro6c0/verify-foundation.mjs
PGlite fallback: migrations applied; RLS, atomic bootstrap rollback, settings, host, and ingestion assertions passed.

$ pnpm verify
exit 0; formatting, lint, typecheck, 177 workspace tests, guardrails, and production build passed

$ git diff --check
exit 0
```

The pgTAP access suite now plans 21 assertions, including bootstrap privilege isolation, verified/idempotent execution, forced audit failure rollback, administrator-only settings access, and `NULL` host rejection. Its runtime status is still blocked by the same absent Docker prerequisite and is not reported as passing.

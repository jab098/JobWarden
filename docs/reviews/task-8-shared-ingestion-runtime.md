# Task 8 Shared Ingestion Runtime Review

## Outcome

Task 8 implementation is independently reviewed with no remaining Critical, Important, or Minor findings. Publication to GitHub `main` is the remaining delivery step.

Reviewed implementation range: `7df2818..8556997`.

## Delivered

- One scheduled/administrator Postgres queue with coalescing, source cooldowns, bounded cleanup, five-minute leases, and a three-attempt ceiling.
- A custom-bearer-protected Supabase Edge Function with a true 2 KiB streamed-body limit, redacted structured logs, and Deno-verified production imports.
- Just-in-time one-source claims under a four-source cap, a 120-second internal deadline, and an adapter abort budget that reserves finalisation time.
- One transactional, service-role-only batch RPC for up to 500 eligible jobs per source, delegating to the existing audited upsert path and rolling back as a unit on failure.
- Source-isolated failure handling in which failed, incomplete, capped, or lease-expired runs cannot advance omission closure.
- A GMT/BST-safe weekday schedule at 09:00, 12:00, 15:00, and 18:00 `Europe/London`, with project URL and bearer material loaded from Vault/environment configuration.
- A local and hosted operations guide covering validation, lawful source smoke tests, pause/resume, quota exhaustion, retry, secret rotation, and incident recovery.

## Independent review and remediation

The frozen first review found extensionless imports that Deno would reject, pre-claimed source leases, unbounded maintenance inside the claim transaction, `Content-Length`-only body enforcement, a nonexistent Supabase CLI invocation command, and provider checks that could not be reproduced from the empty local seed. It also identified the runtime cost of writing as many as 500 jobs through separate HTTP RPC calls.

The final implementation adds the pinned Deno graph check, bounded streamed-body reading, one-at-a-time claims with deadline checks, bounded queue maintenance, one atomic batch persistence call per source, an executable `curl` boundary check, deterministic pgTAP ownership of omission behaviour, and a separate lawful public-provider smoke procedure. The final independent re-review of `7df2818..8556997` found no remaining Critical, Important, or Minor issues.

## Verification evidence

- `pnpm install --frozen-lockfile`: passed; lockfile already current.
- `pnpm verify`: passed on the reviewed tree.
- Existing workspace tests: 393 passed across 32 files.
- Focused Edge Function tests: 34 passed across 4 files.
- Total automated tests: 427 passed.
- Formatting, ESLint, all TypeScript checks, guardrails, and the normal Next.js production build: passed.
- Pinned Deno 2 deployment-graph check: passed.
- `pnpm check:supabase`: passed static verification for 5 migrations and 10 forced-RLS tables.
- `supabase/tests/005_shared_ingestion_runtime.sql`: exactly 36 assertions for `plan(36)` by static count and independent inspection.
- `pnpm audit --prod` and `pnpm audit`: passed with no known vulnerabilities.
- `gitleaks git --log-opts="main..HEAD" --no-banner --redact .`: passed; one exact-range commit and approximately 121 KB scanned with no leaks.
- `git diff --check main...HEAD`: passed.

## Unrun database verification

Docker is not installed in the local environment. Therefore the real Supabase reset, migration execution, and pgTAP suite did not run. They remain a mandatory gate before the runtime is deployed or any real source is enabled:

```sh
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest test db
```

The passing static verifier and independent SQL inspection do not replace this gate.

## External setup and next task

No owner platform setup is required to merge the reviewed local implementation. Activating the runtime later requires the Supabase project, Edge Function secret, Vault entries, Docker-backed validation, and deployment steps documented in `docs/operations/ingestion.md`.

Task 9 follows after publication: add one broad authorised UK source and improve compensation provenance without bypassing the source-access rules for LinkedIn, Indeed, Reed, or Glassdoor.

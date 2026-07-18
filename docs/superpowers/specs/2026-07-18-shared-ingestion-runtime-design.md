# Shared Ingestion Runtime Design

**Status:** approved through the canonical roadmap and owner instruction to proceed without another permission gate

**Task:** 8 — Shared ingestion runtime

## Outcome

JobWarden will run every authorised source through one bounded Postgres queue and one Supabase Edge Function. Administrator requests and scheduled work differ only in who creates the queue row; claiming, source execution, persistence, retry recovery, and completion are identical.

The first deployed adapter remains the reviewed public Greenhouse Job Board API. Task 9 expands source coverage behind the same runtime contract.

## Approaches considered

### Selected: Supabase Cron, Postgres queue, thin Edge Function

Supabase Cron invokes a small Edge Function. Postgres owns coalescing, leases, run creation, cooldowns, and recovery. The function owns authenticated orchestration, provider I/O, normalisation, and calls to the existing atomic ingestion RPCs.

This keeps scheduling close to the database, reuses the reviewed RLS and service-role boundary, costs four function invocations per working day before manual work, and avoids adding Redis or a separate worker service.

### Rejected: Vercel or Cloudflare web cron

This would put ingestion on the web deployment path, add a second operational boundary, and couple source collection to a platform selected for serving pages. It would not improve the queue semantics or free-tier safety.

### Rejected: GitHub Actions as the production scheduler

Actions are useful for CI but are not the product's runtime. Repository secrets, delayed schedules, and a second control plane would make recovery and observability harder.

## Queue and lease model

`ingestion_requests` remains the global queue. Task 8 extends it with:

- `trigger_type`: `admin` or `scheduled`;
- a bounded attempt counter;
- a five-minute claim lease;
- the ingestion run linked to the claim; and
- a sanitised terminal error code.

The service-role-only claim function atomically selects up to the requested maximum with `FOR UPDATE SKIP LOCKED`, creates each existing ingestion run/source-run pair, and returns the source configuration needed by the adapter. The handler asks for one row at a time and repeats at most four times, so a slow source never leaves later, untouched work holding an expiring lease. A partial unique index continues to permit only one pending or claimed row per source.

Expired claims are recovered inside the next claim transaction. Their running source run is finalised as failed with `worker_lease_expired`, which cannot increment omissions. Requests below the three-attempt ceiling return to pending; an exhausted request is cancelled. This makes a killed Edge Function recoverable without an unbounded retry loop.

Disabled sources are cancelled before claim. Source cooldown and active-request coalescing remain database-enforced.

## Scheduler and British time

Supabase databases and Cron run in UTC. London changes between GMT and BST, so four fixed UTC hours cannot preserve the promised local times.

One cron expression runs at the eight possible UTC candidates—08:00, 09:00, 11:00, 12:00, 14:00, 15:00, 17:00, and 18:00, Monday to Friday. A private database function checks `Europe/London` and sends an HTTP request only when the local hour is 09:00, 12:00, 15:00, or 18:00. This produces exactly four scheduled Edge Function invocations per weekday through both GMT and BST.

At a valid slot the handler asks Postgres to enqueue all enabled sources whose allowed minimum interval has elapsed. It then claims the same queue used by administrator requests. At an invalid candidate no HTTP invocation occurs.

## Invocation security

The cron HTTP request uses an ingestion bearer secret stored twice, for separate trust boundaries:

- Supabase Vault supplies it to the database scheduler; and
- Edge Function secrets expose it as `INGESTION_CRON_SECRET`.

The project URL also lives in Vault. Neither value appears in a migration, log, response, test fixture, or client bundle. The handler accepts only `POST` and compares SHA-256 digests of supplied and expected secrets with a constant-work byte comparison. Missing and invalid credentials have the same response.

The Edge Function lazily reads and validates `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `INGESTION_CRON_SECRET` for each invocation. The service-role client exists only under `supabase/functions`.

## Runtime bounds

One invocation has a 120-second internal deadline beneath the hosted Free runtime ceiling. It processes at most four sources sequentially, claims each source immediately before processing it, and stops claiming when fewer than 90 seconds remain. Provider work receives an abort signal that reserves the final 15 seconds for persistence/finalisation. One source response may contain at most 500 jobs. Eligible normalised jobs are persisted through one transactional batch RPC per source, rather than hundreds of sequential network round trips; the batch delegates to the existing audited upsert logic and rolls back as a unit on failure. A response above that ceiling is recorded as incomplete/failed and cannot close unseen listings. Provider retries remain the adapter's reviewed maximum of three attempts with explicit timeouts.

Every source is finalised independently. A failed source produces a sanitised code, completes its queue item, and the handler proceeds to later claims. Successful complete responses alone invoke the existing omission finalisation, so a listing still closes only after two consecutive complete successful omissions.

## Idempotency and logging

The existing `(source_id, provider_job_id)` identity and content hash remain authoritative. Identical jobs only update `last_seen_at` and never create a job audit entry. Scheduled enqueue uses the active-request unique index and produces no duplicate queue/audit event.

Structured logs contain only event name, invocation/source correlation IDs, status, bounded counts, duration, and sanitised error code. They exclude headers, secrets, board tokens, employer payloads, descriptions, application URLs, emails, and raw provider responses.

## Failure behaviour

- Provider, validation, or persistence failure affects one source only.
- Failed, incomplete, capped, or lease-expired work never increments omissions.
- Quota/rate-limit errors preserve the last indexed jobs and surface a sanitised degraded state.
- Repeated cron delivery is safe because scheduled enqueue coalesces active work and job writes are content-idempotent.
- If the free allowance or an operational ceiling is reached, the operator pauses Cron or disables the source; there is no paid fallback.

## Live setup boundary

Local code, fixture tests, migration tests, and static verification proceed without an account. Deployment requires the existing Supabase setup gate: project linking, secrets in Edge Function configuration and Vault, migration application, function deployment, and live queue/omission verification. Exact commands live in `docs/operations/ingestion.md`; real values never enter the repository.

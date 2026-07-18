# Shared Ingestion Operations

**Applies to:** Task 8 shared Greenhouse runtime and every later connector using `ingestion_requests`

**Last provider check:** 2026-07-18

The runtime is implemented and fixture-tested locally. It is not live until the Supabase setup and real database checks in this guide are complete. Never paste a real key into Git, an issue, a pull request, a chat transcript, application logs, or a browser-visible environment variable.

## What runs

- Supabase Cron evaluates eight possible UTC hours on weekdays.
- `private.invoke_jobwarden_ingestion()` admits only 09:00, 12:00, 15:00, and 18:00 in `Europe/London`, including GMT/BST transitions.
- Cron sends one authenticated `POST` to `ingest-jobs`.
- The function enqueues due sources, then processes at most four rows from the same queue used by administrator requests. It claims one row immediately before processing so untouched work never holds an expiring lease.
- The worker uses a 120-second internal deadline, stops claiming when fewer than 90 seconds remain, and reserves 15 seconds for persistence/finalisation beneath the hosted function ceiling.
- A source response may contain at most 500 jobs. Eligible jobs are written in one transactional batch per source. Each claim has a five-minute lease and at most three attempts.
- A source failure is isolated. Failed, incomplete, capped, or lease-expired responses cannot increment omissions or close jobs.

The schedule is four shared invocations per weekday, not four invocations per user. Current Supabase documentation lists 500,000 monthly Edge Function invocations on the Free plan, but the owner must recheck [Edge Function pricing](https://supabase.com/docs/guides/functions/pricing), [Cron guidance](https://supabase.com/docs/guides/cron), and [function limits](https://supabase.com/docs/guides/functions/limits) before deployment.

## Local verification

Docker or a compatible container runtime is required by the Supabase CLI for the real local stack.

1. Install and start Docker Desktop.
2. From the repository root, run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm test:functions
   pnpm typecheck:functions
   pnpm check:deno
   pnpm check:supabase
   pnpm dlx supabase@latest start
   pnpm dlx supabase@latest db reset
   pnpm dlx supabase@latest test db
   ```

3. Create `supabase/functions/.env.local` for local function execution. It is ignored by Git. Supply only local values:

   ```dotenv
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_SERVICE_ROLE_KEY=use-the-local-service-role-value-from-supabase-status
   INGESTION_CRON_SECRET=use-a-random-value-of-at-least-32-characters
   ```

4. Serve the function:

   ```sh
   pnpm dlx supabase@latest functions serve ingest-jobs --no-verify-jwt --env-file supabase/functions/.env.local
   ```

5. Invoke it from a second terminal without putting the secret itself in the command history:

   ```sh
   read -rs JOBWARDEN_LOCAL_INGESTION_SECRET
   curl --fail-with-body --request POST \
     --header "Authorization: Bearer ${JOBWARDEN_LOCAL_INGESTION_SECRET}" \
     --header "Content-Type: application/json" \
     --data '{}' \
     http://127.0.0.1:54321/functions/v1/ingest-jobs
   unset JOBWARDEN_LOCAL_INGESTION_SECRET
   ```

   The seeded local database intentionally contains no real provider source, so this boundary invocation must return `idle`. It proves function loading, bearer authentication, and empty-queue handling; it is not a provider fixture run.

6. Treat `supabase/tests/003_ingestion.sql` and `supabase/tests/005_shared_ingestion_runtime.sql`, run by `supabase test db`, as the deterministic idempotency, two-successful-omission, incomplete-response, lease-recovery, and transactional-batch proof. Those tests create controlled fictional rows and call the database RPCs directly; a changing public job board cannot deterministically prove omissions.
7. Stop the local stack with `pnpm dlx supabase@latest stop`.

### Optional reviewed-provider smoke test

The repository deliberately does not ship a real board token or silently contact a third-party source. Run this only after an owner has reviewed a public Greenhouse board's terms and robots policy and recorded the evidence.

1. Through `/admin/sources`, create one disabled source with provider `greenhouse`, its exact public board token and employer name, `boards.greenhouse.io` as the allowed host, a minimum interval of at least 60 minutes, both review dates, and compliance notes containing the reviewed URLs and decision.
2. Enable only that row, then request one run through `/admin/ingestion`. Do not use direct table inserts or invent a fixture board token.
3. Invoke the local function once with the authenticated `curl` command above. Inspect the queue/run/job queries in **Routine inspection**, plus:

   ```sql
   select action, resource_id, count(*)
   from public.audit_log
   where action in ('job.ingested', 'job.updated')
   group by action, resource_id
   order by resource_id, action;
   ```

4. Request and invoke one later run only after the configured minimum interval. A stable unchanged job must retain one identity row and gain no second ingest/update audit event. Because the provider controls its live payload, do not use this smoke test as the two-omission proof.
5. Disable the reviewed local source when the smoke test ends.

Docker is not currently installed on the development machine. Until these commands pass, the migrations are reviewed static code—not approved for live data.

## One-time hosted Supabase setup

Do this only when the owner chooses to activate Task 8. Authentication setup can remain deferred for fixture work, but a live ingestion deployment still needs its own Supabase project and secrets.

### 1. Create and link the project

1. In the Supabase Dashboard, select **New project**.
2. Choose the intended organisation, a UK/EU-appropriate region, a strong generated database password stored in the owner's password manager, and the Free plan.
3. Open **Project Settings → General** and copy the project reference.
4. Locally run `pnpm dlx supabase@latest login` and complete the browser login.
5. From the repository root run `pnpm dlx supabase@latest link --project-ref YOUR_PROJECT_REF`. The project reference is an identifier, not an API secret, but do not commit generated local state.

### 2. Create the scheduler secret in both trust stores

1. Generate one 32-byte value locally with `openssl rand -hex 32` and save it temporarily in the owner's password manager.
2. In **Project Settings → Edge Functions → Secrets**, add:
   - name: `INGESTION_CRON_SECRET`
   - value: the generated value
3. Confirm the hosted function has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in its default secret set. If the project has migrated entirely to new `sb_secret_...` keys, recheck the current Supabase key migration guidance before changing the compatibility variable used by this function.
4. In **Database → Extensions**, enable **Vault** if it is not already enabled.
5. In **Database → Vault**, create:
   - `jobwarden_project_url` with the exact value `https://YOUR_PROJECT_REF.supabase.co`
   - `jobwarden_ingestion_cron_secret` with the same generated value used for `INGESTION_CRON_SECRET`
6. Delete the temporary plaintext copy after confirming both secret names exist. Do not query `vault.decrypted_secrets` merely to display the values.

### 3. Deploy in the safe order

1. Deploy the function before activating Cron:

   ```sh
   pnpm dlx supabase@latest functions deploy ingest-jobs --no-verify-jwt
   ```

2. Apply migrations, including the queue RPCs and schedule:

   ```sh
   pnpm dlx supabase@latest db push
   ```

3. In **Integrations → Cron → Jobs**, confirm `jobwarden-ingestion-weekdays` exists and is active.
4. In **Edge Functions → ingest-jobs → Logs**, confirm logs contain correlation IDs/counts only. They must not contain the Authorization header, secret, board token, employer payload, description, URL, email, or raw response.

### 4. Prove the live boundary before enabling real sources

1. Keep every production `job_sources.enabled` value false.
2. Invoke with no bearer value and with an invalid value; both must return the same `401 {"error":"unauthorised"}` body.
3. Add one reviewed public Greenhouse source through `/admin/sources` using the exact setup fields in **Optional reviewed-provider smoke test**. No real source is bundled with the repository.
4. Invoke once and inspect `ingestion_requests`, `ingestion_runs`, `ingestion_source_runs`, `jobs`, and `audit_log` using the queries below.
5. Repeat the same payload and prove identity/content idempotency.
6. Confirm the hosted database has already passed the deterministic pgTAP omission and failure cases. Do not manufacture a live provider omission by altering production data.
7. Only then enable the first real allowlisted source.

## Routine inspection

Use the administrator ingestion screen for normal operation. The SQL editor is for incident diagnosis by the owner.

```sql
select
  request.id,
  request.correlation_id,
  request.trigger_type,
  request.status,
  request.attempt_count,
  request.requested_at,
  request.claim_expires_at,
  request.last_error_code
from public.ingestion_requests as request
order by request.requested_at desc
limit 100;
```

```sql
select
  source.employer_name,
  source.enabled,
  source.minimum_sync_interval,
  source.last_successful_sync_at,
  source_run.status,
  source_run.response_complete,
  source_run.received_count,
  source_run.eligible_count,
  source_run.upserted_count,
  source_run.unchanged_count,
  source_run.closed_count,
  source_run.error_code,
  source_run.started_at,
  source_run.completed_at
from public.ingestion_source_runs as source_run
join public.job_sources as source on source.id = source_run.source_id
order by source_run.started_at desc
limit 100;
```

Cron transport history is available in **Integrations → Cron → History** and in `cron.job_run_details`. `pg_net` responses are short-lived diagnostic data; the durable truth is the queue and ingestion run tables.

## Pause and resume

Pause the global schedule before rotating secrets, investigating unexpected volume, or approaching a provider/platform allowance:

```sql
select cron.unschedule('jobwarden-ingestion-weekdays');
```

This does not delete jobs or pending administrator requests. To pause one provider, disable only that reviewed `job_sources` row through the administrator source screen; pending work for a newly disabled source is cancelled before provider access.

Resume the global schedule after the incident is resolved:

```sql
select cron.schedule(
  'jobwarden-ingestion-weekdays',
  '0 8,9,11,12,14,15,17,18 * * 1-5',
  'select private.invoke_jobwarden_ingestion()'
);
```

Confirm only four `Europe/London` admissions occur on the next weekday. The other UTC candidates return before making an HTTP call.

## Retry and lease recovery

- A provider failure completes that queue delivery with a sanitised error and preserves existing jobs. Request a later administrator run only after the source minimum interval.
- A worker killed before finalisation leaves a five-minute lease. The next valid invocation finalises the abandoned run as `worker_lease_expired`, then requeues it if fewer than three attempts have occurred.
- At three attempts the request becomes `cancelled`; investigate the function/run logs and provider health before creating a new request.
- If the source run finalised but queue completion was interrupted, lease recovery marks the request completed instead of re-running the provider.
- Never manually set omission counters, lifecycle status, or queue status to “unstick” work. Repair the cause, preserve evidence, then use the reviewed RPC path.

## Quota or rate-limit exhaustion

1. Pause Cron or disable only the affected source.
2. Leave the last indexed jobs in place. Do not mark them closed while responses are unavailable or incomplete.
3. Record the provider status/error code and check its documented retry/reset window.
4. Increase neither concurrency nor retry count. Do not activate paid overage automatically.
5. Resume only after the allowance resets and the source cadence/compliance record remains valid.

At the current four-weekday-slot cadence, Edge Function invocation count is far below the documented Free allowance. Provider requests, database/egress usage, and future source count remain separate ceilings and must be monitored.

## Secret rotation

1. Pause Cron.
2. Generate a new 32-byte random value and store it temporarily in the password manager.
3. Update `INGESTION_CRON_SECRET` in **Edge Functions → Secrets**.
4. Update `jobwarden_ingestion_cron_secret` in **Database → Vault** using the existing secret's update action; do not create two values with the same name.
5. Invoke once manually with the new secret and confirm the old secret receives the identical unauthorised response.
6. Resume Cron and delete the temporary plaintext copy.

If only one trust store is updated, scheduled calls fail safely with `401`; they do not fall back to an older or public credential.

## Incident recovery and rollback

1. Pause the schedule and disable the affected source if provider traffic must stop immediately.
2. Preserve correlation IDs, sanitised run rows, the deployed function version, and Cron history. Do not copy raw job descriptions or secrets into an incident note.
3. Re-deploy the last known-good function if the regression is in TypeScript.
4. Prefer a forward migration for database defects. Do not drop queue columns or rewrite completed run history during recovery.
5. After repair, let lease recovery resolve abandoned claims, then invoke one source and verify idempotency/omission safety before resuming the schedule.
6. Run `pnpm verify`, the full pgTAP suite, dependency audit, and secret scan again before declaring recovery complete.

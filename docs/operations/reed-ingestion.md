# Reed Ingestion Operations

**Provider record reviewed:** 2026-07-18

**Live state:** implemented but disabled

**Prerequisite:** complete the [shared ingestion setup](ingestion.md), real database reset, and pgTAP suite first

This runbook activates the credential-ready Reed Jobseeker API adapter. It does not grant permission to use Reed data. Before activation, the owner must read the terms shown during API registration and confirm that the intended private-beta indexing, display, retention, attribution, and deletion behaviour is permitted. The public [Jobseeker API page](https://www.reed.co.uk/developers/jobseeker) does not state those grants.

Never paste the Reed API key into Git, a pull request, issue, chat, SQL, URL, browser-visible variable, screenshot, or log. JobWarden does not need the key until this live gate.

## Runtime boundaries

- Provider: `reed`
- Board token: `gb-discovery`
- Employer label: `Reed`
- Allowed host: `www.reed.co.uk`
- Coverage: incremental
- Minimum successful-sync interval: six hours
- Per-run discovery cap: the first 50 results returned by the documented search endpoint; no ordering claim is made
- Detail concurrency: four requests
- Salary provenance: advertised when Reed returns salary data; otherwise unknown
- Omission rule: an incremental omission never closes a role
- Paid fallback: none

The shared worker isolates Reed failures. A missing key, malformed response, provider rate limit, or provider outage fails only that source and does not close existing jobs or prevent later sources from running.

## 1. Review access before registering

1. Open Reed's [Jobseeker API documentation](https://www.reed.co.uk/developers/jobseeker) and follow **Sign up for a reed.co.uk API Key**.
2. Read the current registration terms and any linked API/site terms in full.
3. Confirm that they permit JobWarden's private-beta use: retrieving UK vacancies, displaying selected facts and links, storing canonical records/source occurrences, refreshing at the documented cadence, and deleting data on request or termination.
4. Confirm any attribution and link requirements. The repository does not invent an attribution requirement that Reed has not documented.
5. If the terms are silent or ambiguous, obtain written clarification from Reed before continuing.
6. Record the review date and decision in `docs/product/source-coverage.md`. Changing that permanent compliance record requires owner approval.

Stop here if the intended use is not expressly permitted.

## 2. Store the credential server-side

From the repository root, authenticate and link the intended Supabase project as described in the shared ingestion runbook. Then use a shell variable so the actual key is not written into shell history:

```sh
read -rs JOBWARDEN_REED_API_KEY
pnpm dlx supabase@latest secrets set \
  "REED_API_KEY=${JOBWARDEN_REED_API_KEY}" \
  --project-ref YOUR_PROJECT_REF
unset JOBWARDEN_REED_API_KEY
```

In the Supabase Dashboard, confirm only that a secret named `REED_API_KEY` exists under **Project Settings → Edge Functions → Secrets**. Do not reveal its value. Reed credentials belong only to the Edge Function environment; there is no `NEXT_PUBLIC_REED_API_KEY`.

## 3. Validate the database before adding the source

Use a local or isolated staging database first:

```sh
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest test db
```

The suite must include `supabase/tests/006_uk_coverage_compensation.sql`. Do not enable Reed if migration 6, forced RLS, incremental non-omission, exact source identity, or compensation-provenance assertions fail.

## 4. Create the source disabled

After replacing both review dates and the compliance note with the owner's recorded decision, run this in the linked project's SQL editor. Keep `enabled = false`:

```sql
insert into public.job_sources (
  provider,
  board_token,
  employer_name,
  enabled,
  minimum_sync_interval,
  terms_reviewed_at,
  robots_reviewed_at,
  allowed_method,
  compliance_notes,
  allowed_hosts,
  coverage_mode
)
values (
  'reed',
  'gb-discovery',
  'Reed',
  false,
  interval '6 hours',
  date 'YYYY-MM-DD',
  date 'YYYY-MM-DD',
  'GET',
  'Owner reviewed the current Reed API access and data terms; replace with the actual decision and any attribution or retention limits.',
  array['www.reed.co.uk']::text[],
  'incremental'
)
on conflict (provider, board_token) do update
set
  enabled = false,
  employer_name = excluded.employer_name,
  minimum_sync_interval = excluded.minimum_sync_interval,
  terms_reviewed_at = excluded.terms_reviewed_at,
  robots_reviewed_at = excluded.robots_reviewed_at,
  allowed_method = excluded.allowed_method,
  compliance_notes = excluded.compliance_notes,
  allowed_hosts = excluded.allowed_hosts,
  coverage_mode = excluded.coverage_mode,
  updated_at = clock_timestamp();
```

Reed is environment-managed and deliberately read-only in the current administrator source editor. This prevents a general UI form from weakening its exact provider/token/host/cadence constraint.

## 5. Deploy and run one controlled smoke test

1. Deploy the current `ingest-jobs` function and apply all migrations using the shared ingestion runbook.
2. Keep the weekday Cron job paused while validating Reed.
3. Confirm the source row is exact and disabled:

   ```sql
   select provider, board_token, employer_name, enabled, minimum_sync_interval,
          allowed_hosts, coverage_mode, terms_reviewed_at, robots_reviewed_at
   from public.job_sources
   where provider = 'reed' and board_token = 'gb-discovery';
   ```

4. Enable only this row for the controlled test:

   ```sql
   update public.job_sources
   set enabled = true, updated_at = clock_timestamp()
   where provider = 'reed' and board_token = 'gb-discovery';
   ```

5. As an approved administrator, request the source once from `/admin/ingestion`, then invoke the bearer-protected Edge Function once as described in the [shared ingestion runbook](ingestion.md).
6. Inspect the administrator source-health and ingestion-run views. Confirm:
   - provider is Reed and coverage is incremental;
   - no more than 50 jobs were received;
   - compensation is labelled advertised or unknown, never inferred;
   - source URLs use HTTPS and no credential appears in logs;
   - a repeated request respects the six-hour cooldown; and
   - absent results do not increase omission counts or close prior occurrences.
7. Disable the row again while investigating any mismatch. Resume normal scheduling only after the smoke run and source-health checks pass.

## Pause, rotate, and recover

To stop Reed traffic immediately without affecting other providers:

```sql
update public.job_sources
set enabled = false, updated_at = clock_timestamp()
where provider = 'reed' and board_token = 'gb-discovery';
```

- **Rate limit or outage:** leave the source disabled until the provider recovers. Do not increase concurrency, retry count, cadence, or activate a paid fallback.
- **Compromised key:** disable the source, revoke/regenerate the key with Reed, replace `REED_API_KEY` in Supabase, deploy if required, perform one controlled smoke run, and only then resume.
- **Changed terms:** disable first, record the new review, and resume only if the intended use remains permitted.
- **Bad provider payload:** preserve only correlation IDs, counts, and sanitised error codes. Do not copy raw descriptions, URLs, responses, or credentials into incident notes.

## Termination and provider-data removal

Disable the source and revoke/delete `REED_API_KEY` before any data operation. If Reed or the applicable terms require removal, take an owner-approved database backup, confirm the exact scope, and use a transaction that preserves canonical jobs still evidenced by other providers:

```sql
begin;

create temporary table reed_affected_jobs on commit drop as
select occurrence.job_id
from public.job_source_occurrences as occurrence
join public.job_sources as source on source.id = occurrence.source_id
where source.provider = 'reed' and source.board_token = 'gb-discovery';

delete from public.job_source_occurrences as occurrence
using public.job_sources as source
where occurrence.source_id = source.id
  and source.provider = 'reed'
  and source.board_token = 'gb-discovery';

select private.rematerialize_canonical_job(affected.job_id)
from (select distinct job_id from reed_affected_jobs) as affected
where exists (
  select 1
  from public.job_source_occurrences as remaining
  where remaining.job_id = affected.job_id
);

delete from public.jobs as job
using reed_affected_jobs as affected
where job.id = affected.job_id
  and not exists (
    select 1
    from public.job_source_occurrences as remaining
    where remaining.job_id = job.id
  );

update public.job_sources
set
  enabled = false,
  compliance_notes = 'Reed provider data removed on YYYY-MM-DD; historical source and run audit retained.',
  updated_at = clock_timestamp()
where provider = 'reed' and board_token = 'gb-discovery';

commit;
```

The source row is retained as a disabled compliance tombstone because historical ingestion runs reference it with deletion restrictions. Occurrence candidates are the provider-derived display data: removing them and rematerialising every remaining multi-source canonical job prevents Reed fields from surviving as the selected representation. Do not run this removal block merely to disable ingestion. Deletion is material and should happen only after the owner has confirmed the provider/legal requirement, backup, exact target, and recovery plan. Afterward, verify that no Reed source occurrences remain, any multi-source canonical jobs now use a remaining source, the API key is revoked, caches are purged if introduced later, and the deletion decision is recorded without provider content or secrets.

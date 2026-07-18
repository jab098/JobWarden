begin;

alter table public.job_sources
  add column coverage_mode text not null default 'complete'
    check (coverage_mode in ('complete', 'incremental')),
  add constraint job_sources_supported_provider check (
    (provider = 'greenhouse' and coverage_mode = 'complete')
    or (
      provider = 'reed'
      and board_token = 'gb-discovery'
      and coverage_mode = 'incremental'
    )
  ),
  add constraint job_sources_reed_minimum_interval check (
    provider <> 'reed' or minimum_sync_interval >= interval '6 hours'
  );

alter table public.jobs
  add column compensation_provenance text not null default 'unknown'
    check (compensation_provenance in ('advertised', 'estimated', 'unknown')),
  add column compensation_observed_at timestamptz,
  add column deduplication_key text;

update public.jobs
set
  deduplication_key = content_hash,
  compensation_provenance = case
    when compensation_minimum is not null
      or compensation_maximum is not null
      or compensation_currency is not null then 'advertised'
    else 'unknown'
  end,
  compensation_observed_at = case
    when compensation_minimum is not null
      or compensation_maximum is not null
      or compensation_currency is not null then last_seen_at
    else null
  end
where deduplication_key is null;

alter table public.jobs
  alter column deduplication_key set not null,
  add constraint jobs_deduplication_key_format check (
    deduplication_key ~ '^[a-f0-9]{64}$'
  ),
  add constraint jobs_deduplication_key_unique unique (deduplication_key),
  add constraint jobs_compensation_provenance_consistent check (
    (compensation_provenance = 'unknown'
      and compensation_minimum is null
      and compensation_maximum is null
      and compensation_currency is null)
    or compensation_provenance in ('advertised', 'estimated')
  );

create table public.job_source_occurrences (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  source_id uuid not null references public.job_sources (id) on delete restrict,
  provider_job_id text not null check (char_length(provider_job_id) between 1 and 200),
  provider_application_url text not null
    check (provider_application_url ~ '^https://'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_source_run_id uuid references public.ingestion_source_runs (id) on delete set null,
  consecutive_successful_omissions integer not null default 0
    check (consecutive_successful_omissions >= 0),
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'closed')),
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_source_occurrences_provider_identity_unique
    unique (source_id, provider_job_id)
);

create index job_source_occurrences_job_idx
  on public.job_source_occurrences (job_id, lifecycle_status);
create index job_source_occurrences_expiry_idx
  on public.job_source_occurrences (closes_at, id)
  where lifecycle_status = 'active' and closes_at is not null;

insert into public.job_source_occurrences (
  job_id,
  source_id,
  provider_job_id,
  provider_application_url,
  first_seen_at,
  last_seen_at,
  last_seen_source_run_id,
  consecutive_successful_omissions,
  lifecycle_status,
  closes_at,
  closed_at,
  created_at,
  updated_at
)
select
  id,
  source_id,
  provider_job_id,
  application_url,
  first_seen_at,
  last_seen_at,
  last_seen_source_run_id,
  consecutive_successful_omissions,
  case when lifecycle_status = 'active' then 'active' else 'closed' end,
  closes_at,
  closed_at,
  created_at,
  updated_at
from public.jobs;

alter table public.job_source_occurrences enable row level security;
alter table public.job_source_occurrences force row level security;

create policy "approved users read active job source occurrences"
on public.job_source_occurrences for select to authenticated
using (
  public.has_approved_access()
  and lifecycle_status = 'active'
  and exists (
    select 1
    from public.jobs
    where public.jobs.id = public.job_source_occurrences.job_id
      and public.jobs.lifecycle_status = 'active'
  )
);

create policy "administrators read all job source occurrences"
on public.job_source_occurrences for select to authenticated
using (public.is_admin());

grant select on public.job_source_occurrences to authenticated, service_role;

create or replace function public.upsert_ingested_jobs(
  target_source_run_id uuid,
  jobs_value jsonb
)
returns table (
  inserted_count integer,
  updated_count integer,
  unchanged_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id_value uuid;
  source_run_status text;
  job_value jsonb;
  job_id_value uuid;
  occurrence_id_value uuid;
  existing_hash text;
  outcome_value text;
  eligibility_evidence text[];
  compensation_minimum_value integer;
  compensation_maximum_value integer;
begin
  if jobs_value is null
    or jsonb_typeof(jobs_value) is distinct from 'array'
    or jsonb_array_length(jobs_value) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid ingestion job batch';
  end if;

  select source_id, status
  into source_id_value, source_run_status
  from public.ingestion_source_runs
  where id = target_source_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion source run not found';
  end if;
  if source_run_status is distinct from 'running' then
    raise exception using errcode = '22023', message = 'ingestion source run is not running';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_id_value::text, 0)
  );

  inserted_count := 0;
  updated_count := 0;
  unchanged_count := 0;

  for job_value in select value from jsonb_array_elements(jobs_value)
  loop
    if jsonb_typeof(job_value) is distinct from 'object'
      or jsonb_typeof(job_value -> 'ukEligibilityEvidence') is distinct from 'array'
      or coalesce(job_value ->> 'countryCode', '') <> 'GB'
      or coalesce(job_value ->> 'deduplicationKey', '') !~ '^[a-f0-9]{64}$'
      or coalesce(job_value ->> 'contentHash', '') !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = '22023', message = 'invalid ingestion job';
    end if;

    select coalesce(array_agg(evidence_value), '{}'::text[])
    into eligibility_evidence
    from jsonb_array_elements_text(job_value -> 'ukEligibilityEvidence') as evidence(evidence_value);

    compensation_minimum_value := (job_value ->> 'compensationMinimum')::integer;
    compensation_maximum_value := (job_value ->> 'compensationMaximum')::integer;
    occurrence_id_value := null;
    job_id_value := null;
    existing_hash := null;

    select id, job_id
    into occurrence_id_value, job_id_value
    from public.job_source_occurrences
    where source_id = source_id_value
      and provider_job_id = job_value ->> 'providerJobId'
    for update;

    if job_id_value is null then
      select id, content_hash
      into job_id_value, existing_hash
      from public.jobs
      where deduplication_key = job_value ->> 'deduplicationKey'
      for update;
    else
      select content_hash
      into existing_hash
      from public.jobs
      where id = job_id_value
      for update;
    end if;

    if job_id_value is null then
      insert into public.jobs (
        source_id, provider_job_id, title, employer, description_text,
        application_url, country_code, uk_eligibility_evidence,
        employment_type, working_time, workplace_type, ir35_status,
        compensation_raw, compensation_minimum, compensation_maximum,
        compensation_currency, compensation_period, compensation_provenance,
        compensation_observed_at, posted_at, closes_at, deduplication_key,
        content_hash, last_seen_source_run_id
      ) values (
        source_id_value,
        job_value ->> 'providerJobId',
        job_value ->> 'title',
        job_value ->> 'employer',
        job_value ->> 'descriptionText',
        job_value ->> 'applicationUrl',
        job_value ->> 'countryCode',
        eligibility_evidence,
        job_value ->> 'employmentType',
        job_value ->> 'workingTime',
        job_value ->> 'workplaceType',
        job_value ->> 'ir35Status',
        job_value ->> 'compensationRaw',
        compensation_minimum_value,
        compensation_maximum_value,
        job_value ->> 'compensationCurrency',
        job_value ->> 'compensationPeriod',
        job_value ->> 'compensationProvenance',
        (job_value ->> 'compensationObservedAt')::timestamptz,
        (job_value ->> 'postedAt')::timestamptz,
        (job_value ->> 'closesAt')::timestamptz,
        job_value ->> 'deduplicationKey',
        job_value ->> 'contentHash',
        target_source_run_id
      )
      returning id into job_id_value;
      outcome_value := 'inserted';
    elsif existing_hash is distinct from job_value ->> 'contentHash' then
      update public.jobs
      set
        title = job_value ->> 'title',
        employer = job_value ->> 'employer',
        description_text = job_value ->> 'descriptionText',
        application_url = job_value ->> 'applicationUrl',
        country_code = job_value ->> 'countryCode',
        uk_eligibility_evidence = eligibility_evidence,
        employment_type = job_value ->> 'employmentType',
        working_time = job_value ->> 'workingTime',
        workplace_type = job_value ->> 'workplaceType',
        ir35_status = job_value ->> 'ir35Status',
        compensation_raw = job_value ->> 'compensationRaw',
        compensation_minimum = compensation_minimum_value,
        compensation_maximum = compensation_maximum_value,
        compensation_currency = job_value ->> 'compensationCurrency',
        compensation_period = job_value ->> 'compensationPeriod',
        compensation_provenance = job_value ->> 'compensationProvenance',
        compensation_observed_at = (job_value ->> 'compensationObservedAt')::timestamptz,
        posted_at = (job_value ->> 'postedAt')::timestamptz,
        closes_at = (job_value ->> 'closesAt')::timestamptz,
        content_hash = job_value ->> 'contentHash',
        last_seen_at = clock_timestamp(),
        last_seen_source_run_id = target_source_run_id,
        lifecycle_status = 'active',
        closed_at = null,
        updated_at = clock_timestamp()
      where id = job_id_value;
      outcome_value := 'updated';
    else
      update public.jobs
      set
        last_seen_at = clock_timestamp(),
        last_seen_source_run_id = target_source_run_id,
        lifecycle_status = 'active',
        closed_at = null
      where id = job_id_value;
      outcome_value := 'unchanged';
    end if;

    insert into public.job_source_occurrences (
      job_id, source_id, provider_job_id, provider_application_url,
      last_seen_source_run_id, closes_at
    ) values (
      job_id_value,
      source_id_value,
      job_value ->> 'providerJobId',
      job_value ->> 'applicationUrl',
      target_source_run_id,
      (job_value ->> 'closesAt')::timestamptz
    )
    on conflict (source_id, provider_job_id) do update
    set
      last_seen_at = clock_timestamp(),
      last_seen_source_run_id = excluded.last_seen_source_run_id,
      provider_application_url = excluded.provider_application_url,
      consecutive_successful_omissions = 0,
      lifecycle_status = 'active',
      closes_at = excluded.closes_at,
      closed_at = null,
      updated_at = clock_timestamp();

    if outcome_value <> 'unchanged' then
      insert into public.audit_log (
        actor_user_id, action, resource_type, resource_id, metadata
      ) values (
        null,
        case when outcome_value = 'inserted' then 'job.ingested' else 'job.updated' end,
        'job',
        job_id_value::text,
        jsonb_build_object(
          'source_id', source_id_value,
          'source_run_id', target_source_run_id
        )
      );
    end if;

    inserted_count := inserted_count + case when outcome_value = 'inserted' then 1 else 0 end;
    updated_count := updated_count + case when outcome_value = 'updated' then 1 else 0 end;
    unchanged_count := unchanged_count + case when outcome_value = 'unchanged' then 1 else 0 end;
  end loop;

  return next;
end;
$$;

create or replace function public.finish_source_ingestion(
  target_source_run_id uuid,
  requested_status text,
  response_was_complete boolean,
  received_count_value integer,
  eligible_count_value integer,
  upserted_count_value integer,
  unchanged_count_value integer,
  reported_closed_count integer,
  duration_ms_value integer,
  retry_count_value integer,
  sanitised_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id_value uuid;
  parent_run_id uuid;
  current_status text;
  coverage_mode_value text;
  effective_status text;
  effective_error_code text;
  derived_closed_count integer := 0;
begin
  if requested_status not in ('succeeded', 'failed') then
    raise exception using errcode = '22023', message = 'invalid ingestion status';
  end if;
  if received_count_value < 0
    or eligible_count_value < 0
    or upserted_count_value < 0
    or unchanged_count_value < 0
    or reported_closed_count < 0
    or duration_ms_value < 0
    or retry_count_value not between 0 and 10 then
    raise exception using errcode = '22023', message = 'invalid ingestion counts';
  end if;
  if sanitised_error_code is not null and (
    char_length(sanitised_error_code) not between 3 and 100
    or sanitised_error_code !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ) then
    raise exception using errcode = '22023', message = 'invalid ingestion error code';
  end if;

  select source_run.source_id, source_run.run_id, source_run.status, source.coverage_mode
  into source_id_value, parent_run_id, current_status, coverage_mode_value
  from public.ingestion_source_runs as source_run
  join public.job_sources as source on source.id = source_run.source_id
  where source_run.id = target_source_run_id
  for update of source_run;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion source run not found';
  end if;
  if current_status is distinct from 'running' then
    raise exception using errcode = '22023', message = 'ingestion source run already finalised';
  end if;

  effective_status := requested_status;
  effective_error_code := sanitised_error_code;
  if requested_status = 'succeeded'
    and coverage_mode_value = 'complete'
    and not response_was_complete then
    effective_status := 'failed';
    effective_error_code := 'incomplete_snapshot';
  end if;
  if effective_status = 'failed' and effective_error_code is null then
    raise exception using errcode = '22023', message = 'failed ingestion requires an error code';
  end if;
  if effective_status = 'succeeded' and effective_error_code is not null then
    raise exception using errcode = '22023', message = 'successful ingestion cannot include an error code';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_id_value::text, 0)
  );

  if effective_status = 'succeeded'
    and coverage_mode_value = 'complete' and response_was_complete then
    update public.job_source_occurrences
    set
      consecutive_successful_omissions = consecutive_successful_omissions + 1,
      lifecycle_status = case
        when consecutive_successful_omissions + 1 >= 2 then 'closed'
        else lifecycle_status
      end,
      closed_at = case
        when consecutive_successful_omissions + 1 >= 2 then clock_timestamp()
        else closed_at
      end,
      updated_at = clock_timestamp()
    where source_id = source_id_value
      and lifecycle_status = 'active'
      and last_seen_source_run_id is distinct from target_source_run_id;
  end if;

  with expired_occurrences as (
    select id
    from public.job_source_occurrences
    where lifecycle_status = 'active'
      and closes_at is not null
      and closes_at <= clock_timestamp()
    order by closes_at, id
    limit 500
    for update skip locked
  )
  update public.job_source_occurrences as occurrence
  set
    lifecycle_status = 'closed',
    closed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  from expired_occurrences
  where occurrence.id = expired_occurrences.id;

  with closed_jobs as (
    update public.jobs as job
    set
      lifecycle_status = 'closed',
      closed_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where lifecycle_status = 'active'
      and not exists (
        select 1
        from public.job_source_occurrences as occurrence
        where occurrence.job_id = job.id
          and occurrence.lifecycle_status = 'active'
      )
    returning id
  )
  select count(*)::integer into derived_closed_count from closed_jobs;

  update public.ingestion_source_runs
  set
    status = effective_status,
    response_complete = response_was_complete,
    received_count = received_count_value,
    eligible_count = eligible_count_value,
    upserted_count = upserted_count_value,
    unchanged_count = unchanged_count_value,
    closed_count = derived_closed_count,
    duration_ms = duration_ms_value,
    retry_count = retry_count_value,
    error_code = effective_error_code,
    completed_at = clock_timestamp()
  where id = target_source_run_id;

  update public.ingestion_runs
  set
    status = effective_status,
    completed_at = clock_timestamp(),
    source_count = 1,
    job_count = received_count_value,
    error_summary = effective_error_code
  where id = parent_run_id;

  if effective_status = 'succeeded' then
    update public.job_sources
    set last_successful_sync_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = source_id_value;
  end if;

  insert into public.audit_log (
    actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    null,
    'ingestion.finalised',
    'ingestion_source_run',
    target_source_run_id::text,
    jsonb_build_object(
      'status', effective_status,
      'coverage_mode', coverage_mode_value,
      'response_complete', response_was_complete,
      'closed_count', derived_closed_count,
      'error_code', effective_error_code
    )
  );
end;
$$;

revoke all on function public.upsert_ingested_jobs(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_source_ingestion(
  uuid, text, boolean, integer, integer, integer, integer, integer, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.upsert_ingested_jobs(uuid, jsonb) to service_role;
grant execute on function public.finish_source_ingestion(
  uuid, text, boolean, integer, integer, integer, integer, integer, integer, integer, text
) to service_role;

commit;

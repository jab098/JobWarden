begin;

alter table public.job_sources
  add column coverage_mode text not null default 'complete'
    check (coverage_mode in ('complete', 'incremental')),
  add constraint job_sources_supported_provider check (
    (provider = 'greenhouse' and coverage_mode = 'complete')
    or (
      provider = 'reed'
      and board_token = 'gb-discovery'
      and employer_name = 'Reed'
      and allowed_hosts = array['www.reed.co.uk']::text[]
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
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  candidate_data jsonb not null check (jsonb_typeof(candidate_data) = 'object'),
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
  content_hash,
  candidate_data,
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
  content_hash,
  jsonb_build_object(
    'providerJobId', provider_job_id,
    'title', title,
    'employer', employer,
    'descriptionText', description_text,
    'applicationUrl', application_url,
    'countryCode', country_code,
    'ukEligibilityEvidence', to_jsonb(uk_eligibility_evidence),
    'employmentType', employment_type,
    'workingTime', working_time,
    'workplaceType', workplace_type,
    'ir35Status', ir35_status,
    'compensationRaw', compensation_raw,
    'compensationMinimum', compensation_minimum,
    'compensationMaximum', compensation_maximum,
    'compensationCurrency', compensation_currency,
    'compensationPeriod', compensation_period,
    'compensationProvenance', compensation_provenance,
    'compensationObservedAt', compensation_observed_at,
    'postedAt', posted_at,
    'closesAt', closes_at,
    'deduplicationKey', deduplication_key,
    'contentHash', content_hash
  ),
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

create or replace function private.rematerialize_canonical_job(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  winner record;
  eligibility_evidence text[];
  has_active_occurrence boolean;
begin
  select
    occurrence.candidate_data,
    occurrence.content_hash,
    occurrence.source_id,
    occurrence.provider_job_id,
    occurrence.last_seen_at,
    occurrence.last_seen_source_run_id,
    occurrence.closes_at
  into winner
  from public.job_source_occurrences as occurrence
  join public.job_sources as source on source.id = occurrence.source_id
  where occurrence.job_id = target_job_id
  order by
    case when occurrence.lifecycle_status = 'active' then 0 else 1 end,
    case occurrence.candidate_data ->> 'compensationProvenance'
      when 'advertised' then 0
      when 'estimated' then 1
      else 2
    end,
    case source.provider when 'greenhouse' then 0 else 1 end,
    occurrence.last_seen_at desc,
    occurrence.source_id,
    occurrence.provider_job_id
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(array_agg(evidence_value), '{}'::text[])
  into eligibility_evidence
  from jsonb_array_elements_text(
    winner.candidate_data -> 'ukEligibilityEvidence'
  ) as evidence(evidence_value);

  select exists (
    select 1
    from public.job_source_occurrences
    where job_id = target_job_id and lifecycle_status = 'active'
  ) into has_active_occurrence;

  update public.jobs
  set
    source_id = winner.source_id,
    provider_job_id = winner.provider_job_id,
    title = winner.candidate_data ->> 'title',
    employer = winner.candidate_data ->> 'employer',
    description_text = winner.candidate_data ->> 'descriptionText',
    application_url = winner.candidate_data ->> 'applicationUrl',
    country_code = winner.candidate_data ->> 'countryCode',
    uk_eligibility_evidence = eligibility_evidence,
    employment_type = winner.candidate_data ->> 'employmentType',
    working_time = winner.candidate_data ->> 'workingTime',
    workplace_type = winner.candidate_data ->> 'workplaceType',
    ir35_status = winner.candidate_data ->> 'ir35Status',
    compensation_raw = winner.candidate_data ->> 'compensationRaw',
    compensation_minimum = (winner.candidate_data ->> 'compensationMinimum')::integer,
    compensation_maximum = (winner.candidate_data ->> 'compensationMaximum')::integer,
    compensation_currency = winner.candidate_data ->> 'compensationCurrency',
    compensation_period = winner.candidate_data ->> 'compensationPeriod',
    compensation_provenance = winner.candidate_data ->> 'compensationProvenance',
    compensation_observed_at = (winner.candidate_data ->> 'compensationObservedAt')::timestamptz,
    posted_at = (winner.candidate_data ->> 'postedAt')::timestamptz,
    closes_at = winner.closes_at,
    deduplication_key = winner.candidate_data ->> 'deduplicationKey',
    content_hash = winner.content_hash,
    last_seen_at = winner.last_seen_at,
    last_seen_source_run_id = winner.last_seen_source_run_id,
    lifecycle_status = case when has_active_occurrence then 'active' else 'closed' end,
    closed_at = case
      when has_active_occurrence then null
      else coalesce(closed_at, clock_timestamp())
    end,
    updated_at = clock_timestamp()
  where id = target_job_id;
end;
$$;

revoke all on function private.rematerialize_canonical_job(uuid)
  from public, anon, authenticated;

create or replace function public.start_source_ingestion(
  target_source_id uuid,
  requested_trigger_type text
)
returns table (run_id uuid, source_run_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.job_sources%rowtype;
begin
  if requested_trigger_type not in ('scheduled', 'admin', 'manual') then
    raise exception using errcode = '22023', message = 'invalid ingestion trigger';
  end if;

  select * into source_record
  from public.job_sources
  where id = target_source_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'job source not found';
  end if;
  if not source_record.enabled
    or source_record.provider not in ('greenhouse', 'reed') then
    raise exception using errcode = '22023', message = 'source is not enabled for ingestion';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_source_id::text, 0)
  );

  run_id := gen_random_uuid();
  source_run_id := gen_random_uuid();
  insert into public.ingestion_runs (
    id, trigger_type, status, started_at, source_count
  ) values (
    run_id, requested_trigger_type, 'running', clock_timestamp(), 1
  );
  insert into public.ingestion_source_runs (
    id, run_id, source_id, status, started_at
  ) values (
    source_run_id, run_id, target_source_id, 'running', clock_timestamp()
  );
  return next;
end;
$$;

create or replace function public.enqueue_scheduled_ingestion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.ingestion_requests (source_id, trigger_type)
  select source.id, 'scheduled'
  from public.job_sources as source
  where source.enabled
    and source.provider in ('greenhouse', 'reed')
    and (
      source.last_successful_sync_at is null
      or source.last_successful_sync_at + source.minimum_sync_interval <= clock_timestamp()
    )
    and not exists (
      select 1
      from public.ingestion_requests as recent_request
      where recent_request.source_id = source.id
        and recent_request.requested_at + source.minimum_sync_interval > clock_timestamp()
    )
    and not exists (
      select 1
      from public.ingestion_source_runs as source_run
      where source_run.source_id = source.id
        and source_run.status = 'running'
    )
  on conflict (source_id) where status in ('pending', 'claimed') do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.claim_ingestion_requests(maximum_requests integer)
returns table (
  request_id uuid,
  correlation_id uuid,
  trigger_type text,
  source_run_id uuid,
  source_id uuid,
  provider text,
  board_token text,
  employer_name text,
  allowed_hosts text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_request record;
  queued_request record;
  started_run record;
begin
  if maximum_requests not between 1 and 4 then
    raise exception using errcode = '22023', message = 'invalid ingestion claim limit';
  end if;

  with completed_expired_request as (
    select request.id
    from public.ingestion_requests as request
    join public.ingestion_runs as run on run.id = request.run_id
    where request.status = 'claimed'
      and request.claim_expires_at <= clock_timestamp()
      and run.status in ('succeeded', 'failed')
    order by request.claim_expires_at, request.id
    limit maximum_requests
    for update of request skip locked
  )
  update public.ingestion_requests as request
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    claim_expires_at = null,
    last_error_code = run.error_summary,
    updated_at = clock_timestamp()
  from public.ingestion_runs as run
  where request.id in (select id from completed_expired_request)
    and request.run_id = run.id
    and run.status in ('succeeded', 'failed');

  for expired_request in
    select
      request.id as request_id,
      request.attempt_count,
      source_run.id as source_run_id
    from public.ingestion_requests as request
    join public.ingestion_runs as run on run.id = request.run_id
    join public.ingestion_source_runs as source_run on source_run.run_id = run.id
    where request.status = 'claimed'
      and request.claim_expires_at <= clock_timestamp()
      and run.status = 'running'
      and source_run.status = 'running'
    order by request.claim_expires_at
    limit maximum_requests
    for update of request skip locked
  loop
    perform public.finish_source_ingestion(
      expired_request.source_run_id,
      'failed', false, 0, 0, 0, 0, 0, 0, 0,
      'worker_lease_expired'
    );

    update public.ingestion_requests
    set
      status = case when attempt_count < 3 then 'pending' else 'cancelled' end,
      claimed_at = case when attempt_count < 3 then null else claimed_at end,
      claim_expires_at = null,
      completed_at = case when attempt_count < 3 then null else clock_timestamp() end,
      run_id = case when attempt_count < 3 then null else run_id end,
      last_error_code = 'worker_lease_expired',
      updated_at = clock_timestamp()
    where id = expired_request.request_id;
  end loop;

  with disabled_request as (
    select request.id
    from public.ingestion_requests as request
    where request.status = 'pending'
      and not exists (
        select 1
        from public.job_sources as source
        where source.id = request.source_id
          and source.enabled
          and source.provider in ('greenhouse', 'reed')
      )
    order by request.requested_at, request.id
    limit maximum_requests
    for update of request skip locked
  )
  update public.ingestion_requests as request
  set
    status = 'cancelled',
    completed_at = clock_timestamp(),
    last_error_code = 'source_disabled',
    updated_at = clock_timestamp()
  where request.id in (select id from disabled_request);

  for queued_request in
    select
      request.id as request_id,
      request.correlation_id,
      request.trigger_type,
      source.id as source_id,
      source.provider,
      source.board_token,
      source.employer_name,
      source.allowed_hosts
    from public.ingestion_requests as request
    join public.job_sources as source on source.id = request.source_id
    where request.status = 'pending'
      and request.attempt_count < 3
      and source.enabled
      and source.provider in ('greenhouse', 'reed')
      and not exists (
        select 1
        from public.ingestion_source_runs as active_source_run
        where active_source_run.source_id = source.id
          and active_source_run.status = 'running'
      )
    order by request.requested_at, request.id
    limit maximum_requests
    for update of request skip locked
  loop
    select * into started_run
    from public.start_source_ingestion(
      queued_request.source_id,
      queued_request.trigger_type
    );

    update public.ingestion_requests
    set
      status = 'claimed',
      claimed_at = clock_timestamp(),
      claim_expires_at = clock_timestamp() + interval '5 minutes',
      attempt_count = attempt_count + 1,
      run_id = started_run.run_id,
      last_error_code = null,
      updated_at = clock_timestamp()
    where id = queued_request.request_id;

    request_id := queued_request.request_id;
    correlation_id := queued_request.correlation_id;
    trigger_type := queued_request.trigger_type;
    source_run_id := started_run.source_run_id;
    source_id := queued_request.source_id;
    provider := queued_request.provider;
    board_token := queued_request.board_token;
    employer_name := queued_request.employer_name;
    allowed_hosts := queued_request.allowed_hosts;
    return next;
  end loop;
end;
$$;

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
  occurrence_job_id uuid;
  previous_job_id uuid;
  existing_hash text;
  materialized_hash text;
  outcome_value text;
  eligibility_evidence text[];
  compensation_minimum_value integer;
  compensation_maximum_value integer;
  inserted_job boolean;
  occurrence_count integer;
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
    occurrence_job_id := null;
    previous_job_id := null;
    job_id_value := null;
    existing_hash := null;
    inserted_job := false;

    select job_id
    into occurrence_job_id
    from public.job_source_occurrences
    where source_id = source_id_value
      and provider_job_id = job_value ->> 'providerJobId'
    for update;

    select id, content_hash
    into job_id_value, existing_hash
    from public.jobs
    where deduplication_key = job_value ->> 'deduplicationKey'
    for update;

    if job_id_value is null and occurrence_job_id is not null then
      select count(*)::integer into occurrence_count
      from public.job_source_occurrences
      where job_id = occurrence_job_id;

      if occurrence_count = 1 then
        job_id_value := occurrence_job_id;
        select content_hash into existing_hash
        from public.jobs where id = job_id_value for update;
        update public.jobs
        set deduplication_key = job_value ->> 'deduplicationKey'
        where id = job_id_value;
      end if;
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
      inserted_job := true;
    end if;

    previous_job_id := occurrence_job_id;

    insert into public.job_source_occurrences (
      job_id, source_id, provider_job_id, provider_application_url,
      content_hash, candidate_data, last_seen_source_run_id, closes_at
    ) values (
      job_id_value,
      source_id_value,
      job_value ->> 'providerJobId',
      job_value ->> 'applicationUrl',
      job_value ->> 'contentHash',
      job_value,
      target_source_run_id,
      (job_value ->> 'closesAt')::timestamptz
    )
    on conflict (source_id, provider_job_id) do update
    set
      job_id = excluded.job_id,
      last_seen_at = clock_timestamp(),
      last_seen_source_run_id = excluded.last_seen_source_run_id,
      provider_application_url = excluded.provider_application_url,
      content_hash = excluded.content_hash,
      candidate_data = excluded.candidate_data,
      consecutive_successful_omissions = 0,
      lifecycle_status = 'active',
      closes_at = excluded.closes_at,
      closed_at = null,
      updated_at = clock_timestamp();

    perform private.rematerialize_canonical_job(job_id_value);
    select content_hash into materialized_hash
    from public.jobs where id = job_id_value;

    if inserted_job then
      outcome_value := 'inserted';
    elsif existing_hash is distinct from materialized_hash then
      outcome_value := 'updated';
    else
      outcome_value := 'unchanged';
    end if;

    if previous_job_id is not null and previous_job_id <> job_id_value then
      if exists (
        select 1 from public.job_source_occurrences
        where job_id = previous_job_id
      ) then
        perform private.rematerialize_canonical_job(previous_job_id);
      else
        delete from public.jobs where id = previous_job_id;
      end if;
    end if;

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
  affected_job_ids uuid[] := '{}'::uuid[];
  expiring_occurrence_ids uuid[] := '{}'::uuid[];
  expiring_job_ids uuid[] := '{}'::uuid[];
  affected_job_id uuid;
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

  select coalesce(array_agg(distinct job_id), '{}'::uuid[])
  into affected_job_ids
  from public.job_source_occurrences
  where source_id = source_id_value;

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

  select
    coalesce(array_agg(expiring.id), '{}'::uuid[]),
    coalesce(array_agg(expiring.job_id), '{}'::uuid[])
  into expiring_occurrence_ids, expiring_job_ids
  from (
    select id, job_id
    from public.job_source_occurrences
    where lifecycle_status = 'active'
      and closes_at is not null
      and closes_at <= clock_timestamp()
    order by closes_at, id
    limit 500
    for update skip locked
  ) as expiring;

  affected_job_ids := affected_job_ids || expiring_job_ids;

  update public.job_source_occurrences
  set
    lifecycle_status = 'closed',
    closed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = any(expiring_occurrence_ids);

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

  for affected_job_id in
    select distinct affected.id
    from unnest(affected_job_ids) as affected(id)
  loop
    perform private.rematerialize_canonical_job(affected_job_id);
  end loop;

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

create or replace function public.get_job_source_health()
returns table (
  source_id uuid,
  employer_name text,
  provider text,
  coverage_mode text,
  enabled boolean,
  freshness_state text,
  last_successful_sync_at timestamptz,
  latest_run_status text,
  latest_error_code text,
  active_occurrences integer,
  advertised_compensation integer,
  estimated_compensation integer,
  unknown_compensation integer,
  permanent_roles integer,
  contract_roles integer,
  temporary_roles integer,
  full_time_roles integer,
  part_time_roles integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;

  return query
  select
    source.id,
    source.employer_name,
    source.provider,
    source.coverage_mode,
    source.enabled,
    case
      when not source.enabled then 'disabled'
      when latest_run.status = 'failed' then 'failed'
      when source.last_successful_sync_at is null then 'never'
      when source.last_successful_sync_at + (source.minimum_sync_interval * 2) < clock_timestamp() then 'stale'
      else 'fresh'
    end,
    source.last_successful_sync_at,
    latest_run.status,
    latest_run.error_code,
    coalesce(metrics.active_occurrences, 0),
    coalesce(metrics.advertised_compensation, 0),
    coalesce(metrics.estimated_compensation, 0),
    coalesce(metrics.unknown_compensation, 0),
    coalesce(metrics.permanent_roles, 0),
    coalesce(metrics.contract_roles, 0),
    coalesce(metrics.temporary_roles, 0),
    coalesce(metrics.full_time_roles, 0),
    coalesce(metrics.part_time_roles, 0)
  from public.job_sources as source
  left join lateral (
    select source_run.status, source_run.error_code
    from public.ingestion_source_runs as source_run
    where source_run.source_id = source.id
    order by source_run.started_at desc, source_run.id desc
    limit 1
  ) as latest_run on true
  left join lateral (
    select
      count(*)::integer as active_occurrences,
      count(*) filter (where job.compensation_provenance = 'advertised')::integer as advertised_compensation,
      count(*) filter (where job.compensation_provenance = 'estimated')::integer as estimated_compensation,
      count(*) filter (where job.compensation_provenance = 'unknown')::integer as unknown_compensation,
      count(*) filter (where job.employment_type = 'permanent')::integer as permanent_roles,
      count(*) filter (where job.employment_type = 'contract')::integer as contract_roles,
      count(*) filter (where job.employment_type = 'temporary')::integer as temporary_roles,
      count(*) filter (where job.working_time = 'full_time')::integer as full_time_roles,
      count(*) filter (where job.working_time = 'part_time')::integer as part_time_roles
    from public.job_source_occurrences as occurrence
    join public.jobs as job on job.id = occurrence.job_id
    where occurrence.source_id = source.id
      and occurrence.lifecycle_status = 'active'
  ) as metrics on true
  order by source.employer_name
  limit 200;
end;
$$;

revoke all on function public.get_job_source_health() from public, anon;
grant execute on function public.get_job_source_health() to authenticated;

commit;

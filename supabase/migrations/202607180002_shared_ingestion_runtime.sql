create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

alter table public.ingestion_requests
drop constraint ingestion_requests_state_timestamps;

alter table public.ingestion_requests
add column trigger_type text not null default 'admin'
  check (trigger_type in ('admin', 'scheduled')),
add column attempt_count integer not null default 0
  check (attempt_count between 0 and 3),
add column claim_expires_at timestamptz,
add column run_id uuid references public.ingestion_runs (id) on delete set null,
add column last_error_code text check (
  last_error_code is null
  or (
    char_length(last_error_code) between 3 and 100
    and last_error_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  )
),
add constraint ingestion_requests_state_timestamps check (
  (
    status = 'pending'
    and claimed_at is null
    and claim_expires_at is null
    and completed_at is null
    and run_id is null
  )
  or (
    status = 'claimed'
    and claimed_at is not null
    and claim_expires_at is not null
    and completed_at is null
    and run_id is not null
  )
  or (
    status in ('completed', 'cancelled')
    and claim_expires_at is null
    and completed_at is not null
  )
);

create index ingestion_requests_claim_expiry_idx
on public.ingestion_requests (claim_expires_at)
where status = 'claimed';

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
    and source.provider = 'greenhouse'
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
      'failed',
      false,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
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
          and source.provider = 'greenhouse'
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
      and source.provider = 'greenhouse'
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
    select *
    into started_run
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
  job_value jsonb;
  outcome_value text;
  eligibility_evidence text[];
begin
  if jobs_value is null
    or jsonb_typeof(jobs_value) is distinct from 'array'
    or jsonb_array_length(jobs_value) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid ingestion job batch';
  end if;

  inserted_count := 0;
  updated_count := 0;
  unchanged_count := 0;

  for job_value in select value from jsonb_array_elements(jobs_value)
  loop
    if jsonb_typeof(job_value) is distinct from 'object'
      or jsonb_typeof(job_value -> 'ukEligibilityEvidence') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'invalid ingestion job';
    end if;

    select coalesce(array_agg(evidence_value), '{}'::text[])
    into eligibility_evidence
    from jsonb_array_elements_text(job_value -> 'ukEligibilityEvidence') as evidence(evidence_value);

    select result.outcome
    into outcome_value
    from public.upsert_ingested_job(
      target_source_run_id,
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
      (job_value ->> 'compensationMinimum')::integer,
      (job_value ->> 'compensationMaximum')::integer,
      job_value ->> 'compensationCurrency',
      job_value ->> 'compensationPeriod',
      (job_value ->> 'postedAt')::timestamptz,
      (job_value ->> 'closesAt')::timestamptz,
      job_value ->> 'contentHash'
    ) as result;

    inserted_count := inserted_count + case when outcome_value = 'inserted' then 1 else 0 end;
    updated_count := updated_count + case when outcome_value = 'updated' then 1 else 0 end;
    unchanged_count := unchanged_count + case when outcome_value = 'unchanged' then 1 else 0 end;
  end loop;

  return next;
end;
$$;

create or replace function public.complete_ingestion_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.ingestion_requests%rowtype;
  run_record public.ingestion_runs%rowtype;
begin
  select *
  into request_record
  from public.ingestion_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion request not found';
  end if;

  if request_record.status = 'completed' then
    return;
  end if;

  if request_record.status is distinct from 'claimed' or request_record.run_id is null then
    raise exception using errcode = '22023', message = 'ingestion request is not claimed';
  end if;

  select *
  into run_record
  from public.ingestion_runs
  where id = request_record.run_id;

  if not found or run_record.status = 'running' then
    raise exception using errcode = '22023', message = 'ingestion run is not finalised';
  end if;

  update public.ingestion_requests
  set
    status = 'completed',
    completed_at = clock_timestamp(),
    claim_expires_at = null,
    last_error_code = run_record.error_summary,
    updated_at = clock_timestamp()
  where id = target_request_id;
end;
$$;

revoke all on function public.enqueue_scheduled_ingestion() from public, anon, authenticated;
revoke all on function public.claim_ingestion_requests(integer) from public, anon, authenticated;
revoke all on function public.upsert_ingested_jobs(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_ingestion_request(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_ingestion() to service_role;
grant execute on function public.claim_ingestion_requests(integer) to service_role;
grant execute on function public.upsert_ingested_jobs(uuid, jsonb) to service_role;
grant execute on function public.complete_ingestion_request(uuid) to service_role;

create or replace function private.invoke_jobwarden_ingestion()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  london_time timestamp := clock_timestamp() at time zone 'Europe/London';
  project_url text;
  cron_secret text;
  request_id bigint;
begin
  if extract(isodow from london_time) not between 1 and 5
    or extract(hour from london_time) not in (9, 12, 15, 18) then
    return null;
  end if;

  select decrypted_secret
  into project_url
  from vault.decrypted_secrets
  where name = 'jobwarden_project_url';

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'jobwarden_ingestion_cron_secret';

  if project_url is null
    or project_url !~ '^https://[a-z0-9-]+\.supabase\.co$'
    or cron_secret is null
    or char_length(cron_secret) < 32 then
    raise exception using errcode = '22023', message = 'ingestion scheduler secrets unavailable';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/ingest-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_jobwarden_ingestion() from public, anon, authenticated, service_role;

select cron.schedule(
  'jobwarden-ingestion-weekdays',
  '0 8,9,11,12,14,15,17,18 * * 1-5',
  'select private.invoke_jobwarden_ingestion()'
);

-- Adzuna joins the provider vocabulary, alongside its adapter.
--
-- The adapter landed inert in the previous change, exactly as Lever did in
-- Task 30a: a provider value with no adapter lets an administrator configure a
-- source that saves, enables, and then fails at dispatch.
--
-- Adzuna is **environment-managed**, like Reed and Teaching Vacancies and
-- unlike the four employer boards. It is one national aggregator with a single
-- pinned identity and a credential, so it is deliberately NOT added to
-- `upsert_job_source`: a general administrator form must not be able to weaken
-- its exact provider/token/host/cadence constraint.
--
-- **The function bodies below were generated, not transcribed**, by the method
-- `docs/project-status.md` requires. Each live definition was extracted with
-- `pg_get_functiondef`, the provider list was substituted, and the result was
-- diffed against the extraction to prove that exactly five lines changed across
-- four functions and that each changed line adds only `'adzuna'`.
--
-- The six-hour floor matches Reed and Teaching Vacancies: a national discovery
-- service read repeatedly is a different shape from a per-employer board. The
-- binding limit is the licence's 2,500 requests per month, which is roughly 83
-- a day for the whole product.

alter table public.job_sources
  drop constraint job_sources_supported_provider,
  add constraint job_sources_supported_provider check (
    (
      provider in ('greenhouse', 'lever', 'ashby', 'workable')
      and coverage_mode = 'complete'
    )
    or (
      provider = 'reed'
      and board_token = 'gb-discovery'
      and employer_name = 'Reed'
      and allowed_hosts = array['www.reed.co.uk']::text[]
      and coverage_mode = 'incremental'
    )
    or (
      provider = 'teaching_vacancies'
      and board_token = 'gb-discovery'
      and employer_name = 'Teaching Vacancies'
      and allowed_hosts = array['teaching-vacancies.service.gov.uk']::text[]
      and coverage_mode = 'incremental'
    )
    or (
      -- Incremental by construction: 726,430 GB adverts were indexed when this
      -- was written and a bounded free-tier read cannot see the whole index, so
      -- an absent advert never counts as an omission.
      provider = 'adzuna'
      and board_token = 'gb-discovery'
      and employer_name = 'Adzuna'
      and allowed_hosts = array['www.adzuna.co.uk']::text[]
      and coverage_mode = 'incremental'
    )
  );

-- public.enqueue_scheduled_ingestion — regenerated from the live definition with 'adzuna' added.
CREATE OR REPLACE FUNCTION public.enqueue_scheduled_ingestion()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  inserted_count integer;
begin
  insert into public.ingestion_requests (source_id, trigger_type)
  select source.id, 'scheduled'
  from public.job_sources as source
  where source.enabled
    and source.provider in ('greenhouse', 'lever', 'ashby', 'workable', 'reed', 'teaching_vacancies', 'adzuna')
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
$function$
;

-- public.claim_ingestion_requests — regenerated from the live definition with 'adzuna' added.
CREATE OR REPLACE FUNCTION public.claim_ingestion_requests(maximum_requests integer)
 RETURNS TABLE(request_id uuid, correlation_id uuid, trigger_type text, source_run_id uuid, source_id uuid, provider text, board_token text, employer_name text, allowed_hosts text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          and source.provider in ('greenhouse', 'lever', 'ashby', 'workable', 'reed', 'teaching_vacancies', 'adzuna')
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
      and source.provider in ('greenhouse', 'lever', 'ashby', 'workable', 'reed', 'teaching_vacancies', 'adzuna')
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
$function$
;

-- public.start_source_ingestion — regenerated from the live definition with 'adzuna' added.
CREATE OR REPLACE FUNCTION public.start_source_ingestion(target_source_id uuid, requested_trigger_type text)
 RETURNS TABLE(run_id uuid, source_run_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    or source_record.provider not in ('greenhouse', 'lever', 'ashby', 'workable', 'reed', 'teaching_vacancies', 'adzuna') then
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
$function$
;

-- public.upsert_ingested_jobs — regenerated from the live definition with 'adzuna' added.
CREATE OR REPLACE FUNCTION public.upsert_ingested_jobs(target_source_run_id uuid, jobs_value jsonb)
 RETURNS TABLE(inserted_count integer, updated_count integer, unchanged_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  source_id_value uuid;
  source_run_status text;
  source_enabled boolean;
  source_provider text;
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

  select source_run.source_id, source_run.status, source.enabled, source.provider
  into source_id_value, source_run_status, source_enabled, source_provider
  from public.ingestion_source_runs as source_run
  join public.job_sources as source on source.id = source_run.source_id
  where source_run.id = target_source_run_id
  for update of source_run, source;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion source run not found';
  end if;
  if source_run_status is distinct from 'running' then
    raise exception using errcode = '22023', message = 'ingestion source run is not running';
  end if;
  if not source_enabled or source_provider not in ('greenhouse', 'lever', 'ashby', 'workable', 'reed', 'teaching_vacancies', 'adzuna') then
    raise exception using errcode = '22023', message = 'source is not enabled for ingestion';
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
$function$
;


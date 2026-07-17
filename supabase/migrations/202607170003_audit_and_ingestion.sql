create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'audit_log is append-only';
end;
$$;

revoke all on function private.prevent_audit_log_mutation() from public, anon, authenticated, service_role;

create trigger audit_log_append_only
before update or delete on public.audit_log
for each row execute function private.prevent_audit_log_mutation();

create or replace function public.decide_access_request(
  target_user_id uuid,
  next_status text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_status text;
  clean_reason text := btrim(decision_reason);
begin
  if actor_id is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator required';
  end if;

  if clean_reason is null or char_length(clean_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'decision reason must be 3 to 500 characters';
  end if;

  select status
  into current_status
  from public.access_requests
  where user_id = target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'access request not found';
  end if;

  if not (case
    when current_status = 'pending' then next_status in ('approved', 'rejected')
    when current_status = 'approved' then next_status = 'suspended'
    when current_status = 'rejected' then next_status = 'pending'
    when current_status = 'suspended' then next_status = 'approved'
    else false
  end) then
    raise exception using errcode = '22023', message = 'invalid access status transition';
  end if;

  update public.access_requests
  set
    status = next_status,
    decided_at = clock_timestamp(),
    decision_reason = clean_reason,
    decided_by = actor_id,
    updated_at = clock_timestamp()
  where user_id = target_user_id;

  insert into public.audit_log (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'access.decided',
    'access_request',
    target_user_id::text,
    jsonb_build_object('from_status', current_status, 'to_status', next_status)
  );
end;
$$;

create or replace function public.set_access_requests_enabled(enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  previous_value boolean;
begin
  if actor_id is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator required';
  end if;

  select allow_access_requests
  into previous_value
  from private.app_settings
  where singleton = true
  for update;

  update private.app_settings
  set
    allow_access_requests = enabled,
    updated_at = clock_timestamp(),
    updated_by = actor_id
  where singleton = true;

  insert into public.audit_log (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'access.settings_changed',
    'app_settings',
    'singleton',
    jsonb_build_object('from_enabled', previous_value, 'to_enabled', enabled)
  );
end;
$$;

create or replace function public.upsert_job_source(
  target_source_id uuid,
  provider_name text,
  board_token_value text,
  employer_name_value text,
  enabled_value boolean,
  minimum_sync_minutes integer,
  terms_reviewed_on date,
  robots_reviewed_on date,
  allowed_method_value text,
  compliance_notes_value text,
  allowed_hosts_value text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_id uuid;
begin
  if actor_id is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator required';
  end if;

  if provider_name is distinct from 'greenhouse' then
    raise exception using errcode = '22023', message = 'unsupported source provider';
  end if;

  if board_token_value is null
    or char_length(board_token_value) not between 1 and 200
    or board_token_value !~ '^[A-Za-z0-9._/-]+$' then
    raise exception using errcode = '22023', message = 'invalid board token';
  end if;

  if employer_name_value is null or char_length(btrim(employer_name_value)) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'invalid employer name';
  end if;

  if minimum_sync_minutes is null or minimum_sync_minutes < 5 or minimum_sync_minutes > 10080 then
    raise exception using errcode = '22023', message = 'invalid minimum sync interval';
  end if;

  if terms_reviewed_on is null or robots_reviewed_on is null then
    raise exception using errcode = '22023', message = 'source review dates required';
  end if;

  if allowed_method_value is distinct from 'GET' then
    raise exception using errcode = '22023', message = 'unsupported source method';
  end if;

  if compliance_notes_value is null
    or char_length(btrim(compliance_notes_value)) not between 3 and 5000 then
    raise exception using errcode = '22023', message = 'invalid compliance notes';
  end if;

  if cardinality(allowed_hosts_value) = 0
    or exists (
      select 1
      from unnest(allowed_hosts_value) as allowed_host
      where allowed_host !~ '^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$'
    ) then
    raise exception using errcode = '22023', message = 'invalid allowed host';
  end if;

  if target_source_id is null then
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
      allowed_hosts
    )
    values (
      provider_name,
      board_token_value,
      btrim(employer_name_value),
      enabled_value,
      make_interval(mins => minimum_sync_minutes),
      terms_reviewed_on,
      robots_reviewed_on,
      allowed_method_value,
      btrim(compliance_notes_value),
      allowed_hosts_value
    )
    on conflict (provider, board_token) do update
    set
      employer_name = excluded.employer_name,
      enabled = excluded.enabled,
      minimum_sync_interval = excluded.minimum_sync_interval,
      terms_reviewed_at = excluded.terms_reviewed_at,
      robots_reviewed_at = excluded.robots_reviewed_at,
      allowed_method = excluded.allowed_method,
      compliance_notes = excluded.compliance_notes,
      allowed_hosts = excluded.allowed_hosts,
      updated_at = clock_timestamp()
    returning id into source_id;
  else
    update public.job_sources
    set
      provider = provider_name,
      board_token = board_token_value,
      employer_name = btrim(employer_name_value),
      enabled = enabled_value,
      minimum_sync_interval = make_interval(mins => minimum_sync_minutes),
      terms_reviewed_at = terms_reviewed_on,
      robots_reviewed_at = robots_reviewed_on,
      allowed_method = allowed_method_value,
      compliance_notes = btrim(compliance_notes_value),
      allowed_hosts = allowed_hosts_value,
      updated_at = clock_timestamp()
    where id = target_source_id
    returning id into source_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'job source not found';
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'source.upserted',
    'job_source',
    source_id::text,
    jsonb_build_object('provider', provider_name, 'enabled', enabled_value)
  );

  return source_id;
end;
$$;

revoke all on function public.decide_access_request(uuid, text, text) from public, anon;
revoke all on function public.set_access_requests_enabled(boolean) from public, anon;
revoke all on function public.upsert_job_source(uuid, text, text, text, boolean, integer, date, date, text, text, text[]) from public, anon;
grant execute on function public.decide_access_request(uuid, text, text) to authenticated;
grant execute on function public.set_access_requests_enabled(boolean) to authenticated;
grant execute on function public.upsert_job_source(uuid, text, text, text, boolean, integer, date, date, text, text, text[]) to authenticated;

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

  select *
  into source_record
  from public.job_sources
  where id = target_source_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'job source not found';
  end if;

  if not source_record.enabled or source_record.provider is distinct from 'greenhouse' then
    raise exception using errcode = '22023', message = 'source is not enabled for ingestion';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_source_id::text, 0)
  );

  run_id := gen_random_uuid();
  source_run_id := gen_random_uuid();

  insert into public.ingestion_runs (
    id,
    trigger_type,
    status,
    started_at,
    source_count
  )
  values (run_id, requested_trigger_type, 'running', clock_timestamp(), 1);

  insert into public.ingestion_source_runs (
    id,
    run_id,
    source_id,
    status,
    started_at
  )
  values (source_run_id, run_id, target_source_id, 'running', clock_timestamp());

  return next;
end;
$$;

create or replace function public.upsert_ingested_job(
  target_source_run_id uuid,
  provider_job_id_value text,
  title_value text,
  employer_value text,
  description_text_value text,
  application_url_value text,
  country_code_value text,
  uk_eligibility_evidence_value text[],
  employment_type_value text,
  working_time_value text,
  workplace_type_value text,
  ir35_status_value text,
  compensation_raw_value text,
  compensation_minimum_value integer,
  compensation_maximum_value integer,
  compensation_currency_value text,
  compensation_period_value text,
  posted_at_value timestamptz,
  closes_at_value timestamptz,
  content_hash_value text
)
returns table (job_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id_value uuid;
  run_status text;
  source_provider text;
  source_enabled boolean;
  existing_hash text;
begin
  select source_run.source_id, source_run.status, source.provider, source.enabled
  into source_id_value, run_status, source_provider, source_enabled
  from public.ingestion_source_runs as source_run
  join public.job_sources as source on source.id = source_run.source_id
  where source_run.id = target_source_run_id
  for update of source_run;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion source run not found';
  end if;

  if run_status is distinct from 'running' then
    raise exception using errcode = '22023', message = 'ingestion source run is not active';
  end if;

  if not source_enabled or source_provider is distinct from 'greenhouse' then
    raise exception using errcode = '22023', message = 'source is not enabled for ingestion';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_id_value::text, 0)
  );

  select content_hash, id
  into existing_hash, job_id
  from public.jobs
  where source_id = source_id_value
    and provider_job_id = provider_job_id_value
  for update;

  if not found then
    insert into public.jobs (
      source_id,
      provider_job_id,
      title,
      employer,
      description_text,
      application_url,
      country_code,
      uk_eligibility_evidence,
      employment_type,
      working_time,
      workplace_type,
      ir35_status,
      compensation_raw,
      compensation_minimum,
      compensation_maximum,
      compensation_currency,
      compensation_period,
      posted_at,
      closes_at,
      content_hash,
      last_seen_source_run_id
    )
    values (
      source_id_value,
      provider_job_id_value,
      title_value,
      employer_value,
      description_text_value,
      application_url_value,
      country_code_value,
      uk_eligibility_evidence_value,
      employment_type_value,
      working_time_value,
      workplace_type_value,
      ir35_status_value,
      compensation_raw_value,
      compensation_minimum_value,
      compensation_maximum_value,
      compensation_currency_value,
      compensation_period_value,
      posted_at_value,
      closes_at_value,
      content_hash_value,
      target_source_run_id
    )
    returning id into job_id;

    outcome := 'inserted';
  elsif existing_hash = content_hash_value then
    update public.jobs
    set
      last_seen_at = clock_timestamp(),
      last_seen_source_run_id = target_source_run_id,
      consecutive_successful_omissions = 0,
      lifecycle_status = 'active',
      closed_at = null
    where id = job_id;

    outcome := 'unchanged';
  else
    update public.jobs
    set
      title = title_value,
      employer = employer_value,
      description_text = description_text_value,
      application_url = application_url_value,
      country_code = country_code_value,
      uk_eligibility_evidence = uk_eligibility_evidence_value,
      employment_type = employment_type_value,
      working_time = working_time_value,
      workplace_type = workplace_type_value,
      ir35_status = ir35_status_value,
      compensation_raw = compensation_raw_value,
      compensation_minimum = compensation_minimum_value,
      compensation_maximum = compensation_maximum_value,
      compensation_currency = compensation_currency_value,
      compensation_period = compensation_period_value,
      posted_at = posted_at_value,
      closes_at = closes_at_value,
      content_hash = content_hash_value,
      last_seen_at = clock_timestamp(),
      last_seen_source_run_id = target_source_run_id,
      consecutive_successful_omissions = 0,
      lifecycle_status = 'active',
      closed_at = null,
      updated_at = clock_timestamp()
    where id = job_id;

    outcome := 'updated';
  end if;

  if outcome <> 'unchanged' then
    insert into public.audit_log (
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      null,
      case when outcome = 'inserted' then 'job.ingested' else 'job.updated' end,
      'job',
      job_id::text,
      jsonb_build_object('source_id', source_id_value, 'source_run_id', target_source_run_id)
    );
  end if;

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
  effective_status text;
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

  effective_status := case
    when requested_status = 'succeeded' and response_was_complete then 'succeeded'
    else 'failed'
  end;

  if effective_status = 'failed' and sanitised_error_code is null then
    raise exception using errcode = '22023', message = 'failed ingestion requires an error code';
  end if;

  if effective_status = 'succeeded' and sanitised_error_code is not null then
    raise exception using errcode = '22023', message = 'successful ingestion cannot include an error code';
  end if;

  select source_id, run_id, status
  into source_id_value, parent_run_id, current_status
  from public.ingestion_source_runs
  where id = target_source_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion source run not found';
  end if;

  if current_status is distinct from 'running' then
    raise exception using errcode = '22023', message = 'ingestion source run already finalised';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(source_id_value::text, 0)
  );

  if effective_status = 'succeeded' then
    with omitted_jobs as (
      update public.jobs
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
        and last_seen_source_run_id is distinct from target_source_run_id
      returning lifecycle_status, consecutive_successful_omissions
    )
    select count(*) filter (
      where lifecycle_status = 'closed'
        and consecutive_successful_omissions = 2
    )::integer
    into derived_closed_count
    from omitted_jobs;
  end if;

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
    error_code = sanitised_error_code,
    completed_at = clock_timestamp()
  where id = target_source_run_id;

  update public.ingestion_runs
  set
    status = effective_status,
    completed_at = clock_timestamp(),
    source_count = 1,
    job_count = received_count_value,
    error_summary = sanitised_error_code
  where id = parent_run_id;

  if effective_status = 'succeeded' then
    update public.job_sources
    set last_successful_sync_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = source_id_value;
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    null,
    'ingestion.finalised',
    'ingestion_source_run',
    target_source_run_id::text,
    jsonb_build_object(
      'status', effective_status,
      'response_complete', response_was_complete,
      'closed_count', derived_closed_count,
      'error_code', sanitised_error_code
    )
  );
end;
$$;

revoke all on function public.start_source_ingestion(uuid, text) from public, anon, authenticated;
revoke all on function public.upsert_ingested_job(uuid, text, text, text, text, text, text, text[], text, text, text, text, text, integer, integer, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.finish_source_ingestion(uuid, text, boolean, integer, integer, integer, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.start_source_ingestion(uuid, text) to service_role;
grant execute on function public.upsert_ingested_job(uuid, text, text, text, text, text, text, text[], text, text, text, text, text, integer, integer, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.finish_source_ingestion(uuid, text, boolean, integer, integer, integer, integer, integer, integer, integer, text) to service_role;

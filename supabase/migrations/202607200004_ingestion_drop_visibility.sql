-- Ingestion drop visibility.
--
-- `ingest-jobs/handler.ts` skips every non-eligible outcome with one `continue`
-- and the run record counted only received and eligible, so a source that
-- discarded 95% of its stock looked exactly like a source without much UK
-- content. That is how the UK eligibility classifier defect survived
-- twenty-five tasks. See
-- docs/superpowers/plans/2026-07-20-ingestion-drop-visibility.md.

alter table public.ingestion_source_runs
  add column if not exists excluded_non_uk_count integer not null default 0
    check (excluded_non_uk_count >= 0),
  add column if not exists quarantined_ambiguous_count integer not null default 0
    check (quarantined_ambiguous_count >= 0),
  add column if not exists quarantined_invalid_url_count integer not null default 0
    check (quarantined_invalid_url_count >= 0),
  -- The location strings of adverts quarantined as ambiguous. A count alone
  -- says an administrator has a problem; these say which places the gazetteer
  -- is missing, which is the only form of the answer they can act on.
  add column if not exists unrecognised_locations jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(unrecognised_locations) = 'array'
      and jsonb_array_length(unrecognised_locations) <= 25
    );

-- The argument list changes, so this is a drop rather than a replace: keeping
-- both would leave the eleven-argument overload callable and silently recording
-- no drop reasons.
drop function if exists public.finish_source_ingestion(
  uuid, text, boolean, integer, integer, integer, integer, integer, integer,
  integer, text
);

create function public.finish_source_ingestion(
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
  sanitised_error_code text,
  excluded_non_uk_count_value integer default 0,
  quarantined_ambiguous_count_value integer default 0,
  quarantined_invalid_url_count_value integer default 0,
  unrecognised_locations_value jsonb default '[]'::jsonb
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
  sanitised_locations jsonb := '[]'::jsonb;
  affected_job_ids uuid[] := '{}'::uuid[];
  omitted_job_ids uuid[] := '{}'::uuid[];
  expiring_occurrence_ids uuid[] := '{}'::uuid[];
  expiring_job_ids uuid[] := '{}'::uuid[];
  affected_job_id uuid;
begin
  if requested_status not in ('succeeded', 'failed') then
    raise exception using errcode = '22023', message = 'invalid ingestion status';
  end if;
  if received_count_value < 0
    or eligible_count_value < 0
    or excluded_non_uk_count_value < 0
    or quarantined_ambiguous_count_value < 0
    or quarantined_invalid_url_count_value < 0
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
    select coalesce(array_agg(distinct job_id), '{}'::uuid[])
    into omitted_job_ids
    from public.job_source_occurrences
    where source_id = source_id_value
      and lifecycle_status = 'active'
      and last_seen_source_run_id is distinct from target_source_run_id;

    affected_job_ids := affected_job_ids || omitted_job_ids;

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

  for affected_job_id in
    select distinct affected.id
    from unnest(affected_job_ids) as affected(id)
  loop
    perform private.rematerialize_canonical_job(affected_job_id);
  end loop;

  select count(*)::integer
  into derived_closed_count
  from public.jobs as job
  where job.id = any(affected_job_ids)
    and job.lifecycle_status = 'closed';

  -- Provider text, so it is bounded and de-duplicated at the boundary: a
  -- malformed payload must not be able to grow the run row without limit.
  if jsonb_typeof(unrecognised_locations_value) = 'array' then
    select coalesce(jsonb_agg(location_text order by location_text), '[]'::jsonb)
    into sanitised_locations
    from (
      select distinct left(btrim(element #>> '{}'), 120) as location_text
      from jsonb_array_elements(unrecognised_locations_value) as element
      where jsonb_typeof(element) = 'string'
        and btrim(element #>> '{}') <> ''
      order by 1
      limit 25
    ) as bounded;
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
    excluded_non_uk_count = excluded_non_uk_count_value,
    quarantined_ambiguous_count = quarantined_ambiguous_count_value,
    quarantined_invalid_url_count = quarantined_invalid_url_count_value,
    unrecognised_locations = sanitised_locations,
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

-- `create or replace` preserves a function's privileges; `drop` plus `create`
-- does not. Without these the recreated function would carry PostgreSQL's
-- default ACL, which grants EXECUTE to PUBLIC — and because service_role is a
-- member of PUBLIC, ingestion would keep working and nothing would surface it.
-- This is a security-definer function that bypasses RLS to close live jobs and
-- append audit records, so it must be reachable only by the service role.
revoke all on function public.finish_source_ingestion(
  uuid, text, boolean, integer, integer, integer, integer, integer, integer,
  integer, text, integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.finish_source_ingestion(
  uuid, text, boolean, integer, integer, integer, integer, integer, integer,
  integer, text, integer, integer, integer, jsonb
) to service_role;

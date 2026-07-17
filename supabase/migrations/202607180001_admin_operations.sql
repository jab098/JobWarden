alter table public.job_sources
drop constraint if exists job_sources_minimum_sync_interval_check;

alter table public.job_sources
add constraint job_sources_minimum_sync_interval_check
check (minimum_sync_interval >= interval '15 minutes');

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

  if minimum_sync_minutes is null or minimum_sync_minutes < 15 or minimum_sync_minutes > 10080 then
    raise exception using errcode = '22023', message = 'invalid minimum sync interval';
  end if;

  if terms_reviewed_on is null
    or robots_reviewed_on is null
    or terms_reviewed_on > current_date
    or robots_reviewed_on > current_date then
    raise exception using errcode = '22023', message = 'source review dates required';
  end if;

  if allowed_method_value is distinct from 'GET' then
    raise exception using errcode = '22023', message = 'unsupported source method';
  end if;

  if compliance_notes_value is null
    or char_length(btrim(compliance_notes_value)) not between 3 and 5000 then
    raise exception using errcode = '22023', message = 'invalid compliance notes';
  end if;

  if allowed_hosts_value is null
    or cardinality(allowed_hosts_value) not between 1 and 10
    or array_position(allowed_hosts_value, null) is not null
    or cardinality(allowed_hosts_value) is distinct from (
      select count(distinct allowed_host)::integer
      from unnest(allowed_hosts_value) as allowed_host
    )
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

revoke all on function public.upsert_job_source(uuid, text, text, text, boolean, integer, date, date, text, text, text[]) from public, anon;
grant execute on function public.upsert_job_source(uuid, text, text, text, boolean, integer, date, date, text, text, text[]) to authenticated;

create table public.ingestion_requests (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique default gen_random_uuid(),
  source_id uuid not null references public.job_sources (id) on delete restrict,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingestion_requests_state_timestamps check (
    (status = 'pending' and claimed_at is null and completed_at is null)
    or (status = 'claimed' and claimed_at is not null and completed_at is null)
    or (status in ('completed', 'cancelled') and completed_at is not null)
  )
);

create unique index ingestion_requests_one_active_per_source_idx
on public.ingestion_requests (source_id)
where status in ('pending', 'claimed');

create index ingestion_requests_requested_idx
on public.ingestion_requests (requested_at desc);

alter table public.ingestion_requests enable row level security;
alter table public.ingestion_requests force row level security;

revoke all on public.ingestion_requests from public, anon, authenticated;
grant select on public.ingestion_requests to authenticated;

create policy "administrators read ingestion requests"
on public.ingestion_requests for select to authenticated
using (public.is_admin());

create or replace function public.request_source_ingestion(target_source_id uuid)
returns table (
  request_id uuid,
  correlation_id uuid,
  request_state text,
  eligible_after timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_record public.job_sources%rowtype;
  active_request public.ingestion_requests%rowtype;
  latest_request_at timestamptz;
  ready_at timestamptz;
begin
  if actor_id is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_source_id::text, 1)
  );

  select *
  into source_record
  from public.job_sources
  where id = target_source_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'job source not found';
  end if;

  if not source_record.enabled then
    raise exception using errcode = '22023', message = 'job source is disabled';
  end if;

  select *
  into active_request
  from public.ingestion_requests
  where source_id = target_source_id
    and status in ('pending', 'claimed')
  order by requested_at desc
  limit 1;

  if found then
    return query
    select
      active_request.id,
      active_request.correlation_id,
      'coalesced'::text,
      active_request.requested_at + source_record.minimum_sync_interval;
    return;
  end if;

  if exists (
    select 1
    from public.ingestion_source_runs
    where source_id = target_source_id
      and status = 'running'
  ) then
    raise exception using errcode = 'P0001', message = 'source ingestion already running';
  end if;

  select max(requested_at)
  into latest_request_at
  from public.ingestion_requests
  where source_id = target_source_id;

  ready_at := greatest(
    source_record.last_successful_sync_at + source_record.minimum_sync_interval,
    latest_request_at + source_record.minimum_sync_interval
  );

  if ready_at is not null and clock_timestamp() < ready_at then
    raise exception using errcode = 'P0001', message = 'source cooldown active';
  end if;

  insert into public.ingestion_requests (source_id, requested_by)
  values (target_source_id, actor_id)
  returning * into active_request;

  insert into public.audit_log (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    actor_id,
    'ingestion.requested',
    'ingestion_request',
    active_request.id::text,
    jsonb_build_object(
      'source_id', target_source_id,
      'correlation_id', active_request.correlation_id
    )
  );

  return query
  select
    active_request.id,
    active_request.correlation_id,
    'queued'::text,
    active_request.requested_at;
end;
$$;

revoke all on function public.request_source_ingestion(uuid) from public, anon;
grant execute on function public.request_source_ingestion(uuid) to authenticated;

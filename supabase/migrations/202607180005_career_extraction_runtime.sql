begin;

alter table private.app_settings
  add column career_ai_daily_allowance integer not null default 0 check (
    career_ai_daily_allowance between 0 and 25
  );

create table public.career_ai_daily_usage (
  usage_date date primary key,
  attempt_count integer not null default 0 check (attempt_count between 0 and 25),
  updated_at timestamptz not null default now()
);

alter table public.career_ai_daily_usage enable row level security;
alter table public.career_ai_daily_usage force row level security;

alter table public.cv_extraction_runs
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add constraint cv_extraction_runs_claim_state check (
    (
      status = 'running'
      and claim_token is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'running'
      and claim_token is null
      and lease_expires_at is null
    )
  );

create or replace function public.claim_career_profile_extraction(
  target_user_id uuid,
  target_document_id uuid,
  idempotency_key_value text
)
returns table (
  disposition text,
  run_id uuid,
  user_id uuid,
  cv_document_id uuid,
  storage_path text,
  original_file_name text,
  media_type text,
  byte_size integer,
  ai_allowed boolean,
  status text,
  proposal jsonb,
  error_code text,
  claim_token uuid,
  lease_expires_at timestamptz,
  sha256_hex text
)
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  actor_user_id uuid := target_user_id;
  document_record public.cv_documents%rowtype;
  existing_run public.cv_extraction_runs%rowtype;
  claimed_run_id uuid;
  claimed_token uuid := gen_random_uuid();
  claimed_lease_expires_at timestamptz;
  ai_daily_allowance integer;
  usage_date_value date := (clock_timestamp() at time zone 'UTC')::date;
  may_use_ai boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if actor_user_id is null or not exists (
    select 1
    from public.access_requests as request
    where request.user_id = actor_user_id and request.status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if not public.career_cv_uploads_enabled() then
    raise exception using errcode = '42501', message = 'CV uploads disabled';
  end if;
  if idempotency_key_value !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text, 10)
  );

  update public.cv_extraction_runs as run
  set
    status = 'failed',
    error_code = 'extraction_timeout',
    completed_at = clock_timestamp(),
    claim_token = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where run.user_id = actor_user_id
    and run.status = 'running'
    and run.lease_expires_at <= clock_timestamp();

  select run.* into existing_run
  from public.cv_extraction_runs as run
  where run.user_id = actor_user_id
    and run.idempotency_key = idempotency_key_value;

  if found then
    select document.* into document_record
    from public.cv_documents as document
    where document.id = existing_run.cv_document_id
      and document.user_id = actor_user_id;

    return query select
      'existing'::text,
      existing_run.id,
      actor_user_id,
      existing_run.cv_document_id,
      document_record.storage_path,
      document_record.original_file_name,
      document_record.media_type,
      document_record.byte_size,
      false,
      existing_run.status,
      existing_run.proposal,
      existing_run.error_code,
      existing_run.claim_token,
      existing_run.lease_expires_at,
      document_record.sha256;
    return;
  end if;

  if exists (
    select 1
    from public.cv_extraction_runs as run
    where run.user_id = actor_user_id and run.status = 'running'
  ) then
    raise exception using errcode = '55P03', message = 'extraction already running';
  end if;

  select document.* into document_record
  from public.cv_documents as document
  where document.id = target_document_id
    and document.user_id = actor_user_id
    and document.is_current
    and document.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CV document not found';
  end if;

  select settings.career_ai_daily_allowance into ai_daily_allowance
  from private.app_settings as settings
  where settings.singleton;

  if ai_daily_allowance > 0 then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('career-ai:' || current_date::text, 11)
    );
    if (
      select coalesce(sum(usage.attempt_count), 0) < ai_daily_allowance
      from public.career_ai_daily_usage as usage
      where usage.usage_date = usage_date_value
    ) then
      insert into public.career_ai_daily_usage (
        usage_date, attempt_count, updated_at
      ) values (
        usage_date_value, 1, clock_timestamp()
      )
      on conflict (usage_date) do update set
        attempt_count = public.career_ai_daily_usage.attempt_count + 1,
        updated_at = clock_timestamp()
      where public.career_ai_daily_usage.attempt_count < ai_daily_allowance
      returning true into may_use_ai;
    end if;
    may_use_ai := coalesce(may_use_ai, false);
  end if;

  claimed_lease_expires_at := clock_timestamp() + interval '1 minute';
  insert into public.cv_extraction_runs (
    user_id,
    cv_document_id,
    status,
    extractor_version,
    idempotency_key,
    claim_token,
    lease_expires_at,
    started_at
  ) values (
    actor_user_id,
    document_record.id,
    'running',
    'deterministic-v1',
    idempotency_key_value,
    claimed_token,
    claimed_lease_expires_at,
    clock_timestamp()
  ) returning id into claimed_run_id;

  -- Aliased like every other statement in this function: `returns table`
  -- puts an OUT variable named `user_id` in scope for the whole body, so an
  -- unqualified `user_id` here is ambiguous (42702) and raised at runtime.
  update public.cv_documents as document
  set lifecycle_status = 'processing', updated_at = clock_timestamp()
  where document.id = document_record.id
    and document.user_id = actor_user_id;

  return query select
    'claimed'::text,
    claimed_run_id,
    actor_user_id,
    document_record.id,
    document_record.storage_path,
    document_record.original_file_name,
    document_record.media_type,
    document_record.byte_size,
    may_use_ai,
    'running'::text,
    null::jsonb,
    null::text,
    claimed_token,
    claimed_lease_expires_at,
    document_record.sha256;
end;
$$;

create or replace function public.renew_career_profile_extraction_lease(
  target_run_id uuid,
  target_claim_token uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  renewed_lease_expires_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  update public.cv_extraction_runs as run
  set
    lease_expires_at = clock_timestamp() + interval '1 minute',
    updated_at = clock_timestamp()
  where run.id = target_run_id
    and run.claim_token = target_claim_token
    and run.status = 'running'
    and run.lease_expires_at > clock_timestamp()
  returning run.lease_expires_at into renewed_lease_expires_at;

  if renewed_lease_expires_at is null then
    raise exception using errcode = 'P0002', message = 'active extraction claim not found';
  end if;
  return renewed_lease_expires_at;
end;
$$;

create or replace function public.complete_career_profile_extraction(
  target_run_id uuid,
  target_claim_token uuid,
  requested_status text,
  proposal_value jsonb,
  sanitised_error_code text,
  input_character_count_value integer,
  evidence_count_value integer,
  suggestion_count_value integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.cv_extraction_runs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if requested_status not in ('succeeded', 'failed') then
    raise exception using errcode = '22023', message = 'invalid completion status';
  end if;
  if input_character_count_value not between 0 and 100000
    or evidence_count_value not between 0 and 250
    or suggestion_count_value not between 0 and 100 then
    raise exception using errcode = '22023', message = 'invalid completion counts';
  end if;
  if requested_status = 'succeeded' and (
    proposal_value is null
    or sanitised_error_code is not null
    or jsonb_typeof(proposal_value) <> 'object'
    or octet_length(proposal_value::text) > 262144
  ) then
    raise exception using errcode = '22023', message = 'invalid success result';
  end if;
  if requested_status = 'failed' and (
    proposal_value is not null
    or sanitised_error_code not in (
      'invalid_file', 'unsupported_type', 'file_too_large', 'unsafe_archive',
      'encrypted_pdf', 'page_limit', 'extraction_timeout', 'storage_missing',
      'internal_error'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid failure result';
  end if;

  select run.* into run_record
  from public.cv_extraction_runs as run
  where run.id = target_run_id
    and run.claim_token = target_claim_token
    and run.status = 'running'
    and run.lease_expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'active extraction claim not found';
  end if;

  update public.cv_extraction_runs
  set
    status = requested_status,
    proposal = proposal_value,
    error_code = sanitised_error_code,
    input_character_count = input_character_count_value,
    evidence_count = evidence_count_value,
    suggestion_count = suggestion_count_value,
    completed_at = clock_timestamp(),
    claim_token = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where id = target_run_id;

  update public.cv_documents
  set
    lifecycle_status = case
      when requested_status = 'succeeded' then 'ready'
      else 'failed'
    end,
    updated_at = clock_timestamp()
  where id = run_record.cv_document_id and user_id = run_record.user_id;
end;
$$;

revoke all on public.career_ai_daily_usage from public, anon, authenticated;
grant all on public.career_ai_daily_usage to service_role;

revoke all on function public.claim_career_profile_extraction(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_career_profile_extraction(uuid, uuid, text)
  to service_role;
revoke all on function public.renew_career_profile_extraction_lease(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.renew_career_profile_extraction_lease(uuid, uuid)
  to service_role;
revoke all on function public.complete_career_profile_extraction(
  uuid, uuid, text, jsonb, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_career_profile_extraction(
  uuid, uuid, text, jsonb, text, integer, integer, integer
) to service_role;

commit;

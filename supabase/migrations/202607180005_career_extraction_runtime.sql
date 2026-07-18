begin;

create table public.career_ai_daily_usage (
  user_id uuid not null references public.career_profiles (user_id) on delete cascade,
  usage_date date not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 25),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.career_ai_daily_usage enable row level security;
alter table public.career_ai_daily_usage force row level security;

create or replace function public.claim_career_profile_extraction(
  target_document_id uuid,
  idempotency_key_value text,
  ai_daily_allowance integer default 0
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
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  document_record public.cv_documents%rowtype;
  existing_run public.cv_extraction_runs%rowtype;
  claimed_run_id uuid;
  may_use_ai boolean := false;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if ai_daily_allowance not between 0 and 25 then
    raise exception using errcode = '22023', message = 'invalid AI daily allowance';
  end if;
  if idempotency_key_value !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text, 10)
  );

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
      existing_run.error_code;
    return;
  end if;

  update public.cv_extraction_runs as run
  set
    status = 'failed',
    error_code = 'extraction_timeout',
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where run.user_id = actor_user_id
    and run.status = 'running'
    and run.started_at < clock_timestamp() - interval '1 minute';

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

  if ai_daily_allowance > 0 then
    insert into public.career_ai_daily_usage (
      user_id, usage_date, attempt_count, updated_at
    ) values (
      actor_user_id, current_date, 1, clock_timestamp()
    )
    on conflict (user_id, usage_date) do update set
      attempt_count = public.career_ai_daily_usage.attempt_count + 1,
      updated_at = clock_timestamp()
    where public.career_ai_daily_usage.attempt_count < ai_daily_allowance
    returning true into may_use_ai;
    may_use_ai := coalesce(may_use_ai, false);
  end if;

  insert into public.cv_extraction_runs (
    user_id,
    cv_document_id,
    status,
    extractor_version,
    idempotency_key,
    started_at
  ) values (
    actor_user_id,
    document_record.id,
    'running',
    'deterministic-v1',
    idempotency_key_value,
    clock_timestamp()
  ) returning id into claimed_run_id;

  update public.cv_documents
  set lifecycle_status = 'processing', updated_at = clock_timestamp()
  where id = document_record.id and user_id = actor_user_id;

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
    null::text;
end;
$$;

create or replace function public.complete_career_profile_extraction(
  target_run_id uuid,
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
  if auth.role() <> 'service_role' then
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
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'extraction run not found';
  end if;
  if run_record.status <> 'running' then
    if run_record.status = requested_status then return; end if;
    raise exception using errcode = '22023', message = 'extraction already completed';
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

revoke all on function public.claim_career_profile_extraction(uuid, text, integer)
  from public, anon;
grant execute on function public.claim_career_profile_extraction(uuid, text, integer)
  to authenticated;
revoke all on function public.complete_career_profile_extraction(
  uuid, text, jsonb, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_career_profile_extraction(
  uuid, text, jsonb, text, integer, integer, integer
) to service_role;

commit;

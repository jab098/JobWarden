begin;

-- Per-owner notification channel. Off by default: digests are opt-in, and the
-- unsubscribe token is the only credential that can switch the channel off
-- without an authenticated session.
create table public.career_notification_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  channel_enabled boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_notification_settings_token_unique unique (unsubscribe_token)
);

alter table public.career_notification_settings enable row level security;
alter table public.career_notification_settings force row level security;

create policy "approved users read own notification settings"
on public.career_notification_settings for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_notification_settings from public, anon, authenticated;
grant select on public.career_notification_settings to authenticated;
grant all on public.career_notification_settings to service_role;

-- Deduplication ledger. The key is the (profile, job) pair, so a job that
-- matches two search profiles is announced once for each, and never twice for
-- the same one.
create table public.career_notification_announcements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  search_profile_id uuid not null references public.search_profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  announced_at timestamptz not null default now(),
  constraint career_notification_announcements_unique
    unique (owner_id, search_profile_id, job_id)
);

alter table public.career_notification_announcements enable row level security;
alter table public.career_notification_announcements force row level security;

create policy "approved users read own notification announcements"
on public.career_notification_announcements for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_notification_announcements from public, anon, authenticated;
grant select on public.career_notification_announcements to authenticated;
grant all on public.career_notification_announcements to service_role;

-- Postgres does not index foreign keys automatically, and both cascades run
-- during ordinary product use (a deleted search profile, a closed job).
create index career_notification_announcements_search_idx
  on public.career_notification_announcements (search_profile_id);
create index career_notification_announcements_job_idx
  on public.career_notification_announcements (job_id);

-- One row per owner per scheduled slot. This is both the user-visible delivery
-- status and the auditable free-tier counter; there is no second ledger that
-- could disagree with it.
create table public.career_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slot_key text not null check (slot_key ~ '^\d{4}-\d{2}-\d{2}T\d{2}$'),
  status text not null check (
    status in (
      'pending', 'sent', 'failed',
      'suppressed_no_matches', 'suppressed_daily_cap', 'suppressed_monthly_cap'
    )
  ),
  match_count integer not null default 0 check (match_count >= 0),
  provider_message_id text check (
    provider_message_id is null
    or char_length(provider_message_id) between 1 and 200
  ),
  error_code text check (error_code is null or error_code ~ '^[a-z_]{1,60}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_notification_deliveries_slot_unique unique (owner_id, slot_key)
);

alter table public.career_notification_deliveries enable row level security;
alter table public.career_notification_deliveries force row level security;

create policy "approved users read own notification deliveries"
on public.career_notification_deliveries for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_notification_deliveries from public, anon, authenticated;
grant select on public.career_notification_deliveries to authenticated;
grant all on public.career_notification_deliveries to service_role;

-- The free-tier ceiling is counted from this index on every send decision.
create index career_notification_deliveries_counter_idx
  on public.career_notification_deliveries (status, created_at);
create index career_notification_deliveries_owner_idx
  on public.career_notification_deliveries (owner_id, created_at desc);

create or replace function public.set_career_notification_settings(
  target_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if target_enabled is null then
    raise exception using errcode = '22023', message = 'invalid notification setting';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  insert into public.career_notification_settings (owner_id, channel_enabled)
  values (actor_user_id, target_enabled)
  on conflict (owner_id) do update
  set channel_enabled = excluded.channel_enabled,
      updated_at = clock_timestamp();
end;
$$;

revoke all on function public.set_career_notification_settings(boolean) from public, anon;
grant execute on function public.set_career_notification_settings(boolean) to authenticated;

-- Reachable without a session because an unsubscribe link has to work from an
-- email client. The token is the only accepted input and nothing is returned
-- but whether a row matched, so this cannot be used to read or enumerate any
-- other column.
create or replace function public.unsubscribe_career_notifications(
  target_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched boolean := false;
begin
  if target_token is null then
    return false;
  end if;

  update public.career_notification_settings
  set channel_enabled = false, updated_at = clock_timestamp()
  where unsubscribe_token = target_token;

  get diagnostics matched = row_count;
  return matched;
end;
$$;

revoke all on function public.unsubscribe_career_notifications(uuid) from public;
grant execute on function public.unsubscribe_career_notifications(uuid) to anon, authenticated;

-- Service-role read for the scheduled digest runtime. Career evidence is
-- projected without its excerpt: the notification path never needs CV prose,
-- so the boundary is enforced here rather than trusted downstream.
create or replace function public.list_pending_notification_digests(
  target_slot text,
  max_owners integer
)
returns table (
  owner_id uuid,
  email text,
  unsubscribe_token uuid,
  searches jsonb,
  evidence jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    raise exception using errcode = '22023', message = 'invalid slot key';
  end if;
  if max_owners is null or max_owners < 1 or max_owners > 200 then
    raise exception using errcode = '22023', message = 'invalid owner limit';
  end if;

  return query
  select
    settings.owner_id,
    account.email::text,
    settings.unsubscribe_token,
    coalesce((
      select jsonb_agg(to_jsonb(search) order by search.created_at, search.id)
      from public.search_profiles as search
      where search.user_id = settings.owner_id
        and search.enabled
        and search.notifications_enabled
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'normalized_concept', item.normalized_concept,
          'label', item.label,
          'category', item.category,
          'origin', item.origin,
          'confidence', item.confidence,
          'evidence_reference', item.evidence_reference,
          'proficiency_signal', item.proficiency_signal,
          'last_used_at', item.last_used_at,
          'confirmation_state', item.confirmation_state
        )
        order by item.created_at, item.id
      )
      from public.career_evidence_items as item
      where item.user_id = settings.owner_id
        and item.confirmation_state = 'confirmed'
    ), '[]'::jsonb)
  from public.career_notification_settings as settings
  join auth.users as account on account.id = settings.owner_id
  where settings.channel_enabled
    and account.email is not null
    and exists (
      select 1
      from public.access_requests as request
      where request.user_id = settings.owner_id
        and request.status = 'approved'
    )
    and exists (
      select 1
      from public.search_profiles as search
      where search.user_id = settings.owner_id
        and search.enabled
        and search.notifications_enabled
    )
    and not exists (
      select 1
      from public.career_notification_deliveries as delivery
      where delivery.owner_id = settings.owner_id
        and delivery.slot_key = target_slot
    )
  order by settings.owner_id
  limit max_owners;
end;
$$;

revoke all on function public.list_pending_notification_digests(text, integer)
  from public, anon, authenticated;
grant execute on function public.list_pending_notification_digests(text, integer)
  to service_role;

-- The shared candidate window, read once per invocation and scored for every
-- recipient. Notification matching never issues a source request, so digest
-- cost cannot grow with the number of users.
create or replace function public.list_notification_candidate_jobs(
  max_jobs integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if max_jobs is null or max_jobs < 1 or max_jobs > 500 then
    raise exception using errcode = '22023', message = 'invalid job limit';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(candidate))
    from (
      select
        job.id,
        job.title,
        job.employer,
        job.description_text,
        coalesce((
          select location.raw_location
          from public.job_locations as location
          where location.job_id = job.id
          order by location.raw_location
          limit 1
        ), 'UK location not specified') as location,
        job.employment_type,
        job.working_time,
        job.workplace_type,
        job.ir35_status,
        job.compensation_minimum,
        job.compensation_maximum,
        job.compensation_period,
        job.compensation_provenance,
        job.posted_at
      from public.jobs as job
      where job.lifecycle_status = 'active'
      order by job.posted_at desc nulls last, job.id desc
      limit max_jobs
    ) as candidate
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_notification_candidate_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.list_notification_candidate_jobs(integer)
  to service_role;

-- Deduplication keys for exactly the candidate window in hand, so the ledger
-- read stays bounded however long the install has been running.
create or replace function public.list_notification_announcements(
  target_owner uuid,
  target_job_ids uuid[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_owner is null then
    raise exception using errcode = '22023', message = 'invalid owner';
  end if;
  if target_job_ids is null or cardinality(target_job_ids) > 500 then
    raise exception using errcode = '22023', message = 'invalid job filter';
  end if;

  return coalesce((
    select array_agg(
      announcement.search_profile_id::text || ':' || announcement.job_id::text
    )
    from public.career_notification_announcements as announcement
    where announcement.owner_id = target_owner
      and announcement.job_id = any (target_job_ids)
  ), array[]::text[]);
end;
$$;

revoke all on function public.list_notification_announcements(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.list_notification_announcements(uuid, uuid[])
  to service_role;

-- Records the slot outcome before anything is sent. Every refusal reason is
-- persisted, so a suppressed slot is auditable rather than silent, and the
-- unique (owner, slot) constraint makes a repeated invocation a no-op.
-- In-flight 'pending' rows count towards the ceiling so a send cannot race
-- past the configured free allowance.
create or replace function public.begin_notification_digest(
  target_owner uuid,
  target_slot text,
  target_match_count integer,
  daily_limit integer,
  monthly_limit integer
)
returns table (delivery_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_status text;
  inserted_id uuid;
  daily_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  monthly_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
begin
  if target_owner is null then
    raise exception using errcode = '22023', message = 'invalid owner';
  end if;
  if target_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    raise exception using errcode = '22023', message = 'invalid slot key';
  end if;
  if target_match_count is null or target_match_count < 0 then
    raise exception using errcode = '22023', message = 'invalid match count';
  end if;
  if daily_limit is null or daily_limit < 0
    or monthly_limit is null or monthly_limit < 0 then
    raise exception using errcode = '22023', message = 'invalid delivery limit';
  end if;

  if target_match_count = 0 then
    resolved_status := 'suppressed_no_matches';
  elsif (
    select count(*)
    from public.career_notification_deliveries as delivery
    where delivery.status in ('pending', 'sent')
      and delivery.created_at >= daily_start
  ) >= daily_limit then
    resolved_status := 'suppressed_daily_cap';
  elsif (
    select count(*)
    from public.career_notification_deliveries as delivery
    where delivery.status in ('pending', 'sent')
      and delivery.created_at >= monthly_start
  ) >= monthly_limit then
    resolved_status := 'suppressed_monthly_cap';
  else
    resolved_status := 'pending';
  end if;

  insert into public.career_notification_deliveries (
    owner_id, slot_key, status, match_count
  )
  values (target_owner, target_slot, resolved_status, target_match_count)
  on conflict (owner_id, slot_key) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return query select null::uuid, 'already_recorded'::text;
    return;
  end if;

  return query
  select
    inserted_id,
    case when resolved_status = 'pending' then 'claimed' else resolved_status end;
end;
$$;

revoke all on function public.begin_notification_digest(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.begin_notification_digest(uuid, text, integer, integer, integer)
  to service_role;

-- Closes a claimed slot. Announcements are recorded only on a successful send,
-- so a provider failure cannot suppress the next slot's digest. A search
-- profile or job deleted mid-run is skipped rather than aborting the batch.
create or replace function public.finish_notification_digest(
  target_delivery_id uuid,
  target_status text,
  target_provider_message_id text,
  target_error_code text,
  target_announcements jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_owner uuid;
begin
  if target_status not in ('sent', 'failed') then
    raise exception using errcode = '22023', message = 'invalid delivery status';
  end if;
  if target_announcements is null
    or jsonb_typeof(target_announcements) <> 'array'
    or jsonb_array_length(target_announcements) > 2000 then
    raise exception using errcode = '22023', message = 'invalid announcements';
  end if;

  update public.career_notification_deliveries
  set status = target_status,
      provider_message_id = target_provider_message_id,
      error_code = target_error_code,
      updated_at = clock_timestamp()
  where id = target_delivery_id and status = 'pending'
  returning owner_id into delivery_owner;

  if delivery_owner is null then
    raise exception using errcode = 'P0002', message = 'claimed delivery not found';
  end if;

  if target_status <> 'sent' then
    return;
  end if;

  insert into public.career_notification_announcements (
    owner_id, search_profile_id, job_id
  )
  select delivery_owner, announcement.search_profile_id, announcement.job_id
  from jsonb_to_recordset(target_announcements)
    as announcement(search_profile_id uuid, job_id uuid)
  where exists (
      select 1
      from public.search_profiles as search
      where search.id = announcement.search_profile_id
        and search.user_id = delivery_owner
    )
    and exists (
      select 1 from public.jobs as job where job.id = announcement.job_id
    )
  on conflict (owner_id, search_profile_id, job_id) do nothing;
end;
$$;

revoke all on function public.finish_notification_digest(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_notification_digest(uuid, text, text, text, jsonb)
  to service_role;

-- Career deletion now also erases the notification channel, its deduplication
-- ledger, and its delivery history.
create or replace function public.delete_career_profile_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;
  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'career-documents'
      and object.name like actor_user_id::text || '/%'
  ) then
    raise exception using
      errcode = '23503',
      message = 'Storage objects must be removed first';
  end if;
  update public.career_profile_generations
  set generation = generation + 1, updated_at = clock_timestamp()
  where user_id = actor_user_id;
  delete from public.career_cv_upload_intents where user_id = actor_user_id;
  delete from public.career_job_decisions where owner_id = actor_user_id;
  delete from public.career_pathway_decisions where owner_id = actor_user_id;
  delete from public.career_explore_settings where owner_id = actor_user_id;
  delete from public.career_application_events where owner_id = actor_user_id;
  delete from public.career_applications where owner_id = actor_user_id;
  delete from public.career_notification_deliveries where owner_id = actor_user_id;
  delete from public.career_notification_announcements where owner_id = actor_user_id;
  delete from public.career_notification_settings where owner_id = actor_user_id;
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

commit;

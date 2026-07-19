begin;

-- Mandatory initialisation. An approved user is held at onboarding until they
-- have built enough of a profile for the product to work, so this row is the
-- gate's source of truth. Its absence means "not onboarded", which is why the
-- gate fails closed on a missing or unreadable row rather than admitting.
create table public.career_onboarding_state (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  path text not null default 'cv' check (path in ('cv', 'aspiration')),
  completed_steps text[] not null default '{}'::text[] check (
    completed_steps <@ array[
      'cv', 'confirm_evidence', 'aspirations', 'preferences',
      'notifications', 'review'
    ]::text[]
    and cardinality(completed_steps) <= 6
    and array_position(completed_steps, null) is null
  ),
  cv_outcome text check (
    cv_outcome is null
    or cv_outcome in ('rich', 'rich_pdf_only', 'thin', 'failed', 'none')
  ),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_onboarding_state enable row level security;
alter table public.career_onboarding_state force row level security;

create policy "approved users read own onboarding state"
on public.career_onboarding_state for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_onboarding_state from public, anon, authenticated;
grant select on public.career_onboarding_state to authenticated;
grant all on public.career_onboarding_state to service_role;

-- Mirrors stepsForPath in packages/domain/src/onboarding.ts; a repository test
-- keeps the two lists in lockstep.
create or replace function public.onboarding_steps_for_path(target_path text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case target_path
    when 'cv' then array['cv', 'confirm_evidence', 'preferences', 'notifications', 'review']
    when 'aspiration' then array['cv', 'aspirations', 'preferences', 'notifications', 'review']
    else array[]::text[]
  end;
$$;

create or replace function public.advance_onboarding(
  target_path text,
  target_step text,
  target_cv_outcome text
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
  if target_path not in ('cv', 'aspiration') then
    raise exception using errcode = '22023', message = 'invalid onboarding path';
  end if;
  if not (target_step = any (public.onboarding_steps_for_path(target_path))) then
    raise exception using errcode = '22023', message = 'step not part of this path';
  end if;
  if target_cv_outcome is not null
    and target_cv_outcome not in ('rich', 'rich_pdf_only', 'thin', 'failed', 'none') then
    raise exception using errcode = '22023', message = 'invalid cv outcome';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  insert into public.career_onboarding_state (
    owner_id, path, completed_steps, cv_outcome
  )
  values (
    actor_user_id, target_path, array[target_step], target_cv_outcome
  )
  on conflict (owner_id) do update
  set path = excluded.path,
      cv_outcome = coalesce(excluded.cv_outcome, public.career_onboarding_state.cv_outcome),
      -- Switching path keeps only the steps the new path actually asks, so a
      -- step answered on the other branch cannot satisfy a question this branch
      -- has never put to the user.
      completed_steps = (
        select coalesce(array_agg(distinct step), array[]::text[])
        from unnest(
          public.career_onboarding_state.completed_steps || array[excluded.completed_steps[1]]
        ) as step
        where step = any (public.onboarding_steps_for_path(excluded.path))
      ),
      updated_at = clock_timestamp();
end;
$$;

revoke all on function public.advance_onboarding(text, text, text) from public, anon;
grant execute on function public.advance_onboarding(text, text, text) to authenticated;

-- Completion is decided by the database, not by the client. Every step the
-- chosen path asks must already be recorded, so a crafted call cannot skip the
-- flow and unlock the hub.
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_state public.career_onboarding_state;
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

  select * into current_state
  from public.career_onboarding_state
  where owner_id = actor_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'onboarding not started';
  end if;

  if exists (
    select 1
    from unnest(public.onboarding_steps_for_path(current_state.path)) as required
    where not (required = any (current_state.completed_steps))
  ) then
    raise exception using errcode = '22023', message = 'onboarding steps incomplete';
  end if;

  update public.career_onboarding_state
  set completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where owner_id = actor_user_id;
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;

-- Deleting career data removes the profile onboarding built, so the user is
-- walked through setup again rather than landing on an empty hub that believes
-- it is configured.
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
  delete from public.career_cv_variants where owner_id = actor_user_id;
  delete from public.career_onboarding_state where owner_id = actor_user_id;
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

commit;

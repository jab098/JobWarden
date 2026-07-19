begin;

-- Manual external applications tracked per owner. JobWarden never submits an
-- application or contacts a recruiter; these rows only record what the owner
-- did on the employer's own site.
create table public.career_applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  stage text not null default 'applied' check (
    stage in (
      'applied', 'screening', 'interviewing', 'offer',
      'accepted', 'rejected', 'withdrawn', 'archived'
    )
  ),
  next_action text check (char_length(next_action) between 1 and 200),
  next_action_due_on date,
  notes text check (char_length(notes) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_applications_owner_job_unique unique (owner_id, job_id)
);

alter table public.career_applications enable row level security;
alter table public.career_applications force row level security;

create policy "approved users read own applications"
on public.career_applications for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_applications from public, anon, authenticated;
grant select on public.career_applications to authenticated;
grant all on public.career_applications to service_role;

-- Append-only per-user audit of every stage transition. Rows are written only
-- inside the owner-fenced RPCs below and are never updated or deleted except
-- through application/profile deletion.
create table public.career_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.career_applications (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  from_stage text check (
    from_stage in (
      'applied', 'screening', 'interviewing', 'offer',
      'accepted', 'rejected', 'withdrawn', 'archived'
    )
  ),
  to_stage text not null check (
    to_stage in (
      'applied', 'screening', 'interviewing', 'offer',
      'accepted', 'rejected', 'withdrawn', 'archived'
    )
  ),
  occurred_at timestamptz not null default now()
);

alter table public.career_application_events enable row level security;
alter table public.career_application_events force row level security;

create policy "approved users read own application events"
on public.career_application_events for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_application_events from public, anon, authenticated;
grant select on public.career_application_events to authenticated;
grant all on public.career_application_events to service_role;

create or replace function public.track_career_application(
  target_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  existing_application_id uuid;
  new_application_id uuid;
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

  if not exists (
    select 1 from public.jobs where id = target_job_id
  ) then
    raise exception using errcode = 'P0002', message = 'job not found';
  end if;

  select id into existing_application_id
  from public.career_applications
  where owner_id = actor_user_id and job_id = target_job_id;
  if found then
    return existing_application_id;
  end if;

  insert into public.career_applications (owner_id, job_id)
  values (actor_user_id, target_job_id)
  returning id into new_application_id;

  insert into public.career_application_events (
    application_id, owner_id, from_stage, to_stage
  )
  values (new_application_id, actor_user_id, null, 'applied');

  return new_application_id;
end;
$$;

revoke all on function public.track_career_application(uuid) from public, anon;
grant execute on function public.track_career_application(uuid) to authenticated;

create or replace function public.transition_career_application(
  target_application_id uuid,
  target_stage text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_stage text;
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

  select stage into current_stage
  from public.career_applications
  where id = target_application_id and owner_id = actor_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'application not found';
  end if;

  -- Mirrors applicationTransitions in packages/domain/src/applications.ts;
  -- a repository test keeps the two maps in lockstep.
  if not (
    (current_stage, target_stage) in (
      ('applied', 'screening'),
      ('applied', 'interviewing'),
      ('applied', 'offer'),
      ('applied', 'rejected'),
      ('applied', 'withdrawn'),
      ('applied', 'archived'),
      ('screening', 'interviewing'),
      ('screening', 'offer'),
      ('screening', 'rejected'),
      ('screening', 'withdrawn'),
      ('screening', 'archived'),
      ('interviewing', 'offer'),
      ('interviewing', 'rejected'),
      ('interviewing', 'withdrawn'),
      ('interviewing', 'archived'),
      ('offer', 'accepted'),
      ('offer', 'rejected'),
      ('offer', 'withdrawn'),
      ('offer', 'archived'),
      ('accepted', 'archived'),
      ('rejected', 'archived'),
      ('withdrawn', 'archived')
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid application transition';
  end if;

  update public.career_applications
  set stage = target_stage, updated_at = clock_timestamp()
  where id = target_application_id and owner_id = actor_user_id;

  insert into public.career_application_events (
    application_id, owner_id, from_stage, to_stage
  )
  values (target_application_id, actor_user_id, current_stage, target_stage);

  return target_stage;
end;
$$;

revoke all on function public.transition_career_application(uuid, text) from public, anon;
grant execute on function public.transition_career_application(uuid, text) to authenticated;

create or replace function public.update_career_application_plan(
  target_application_id uuid,
  target_next_action text,
  target_due_on date,
  target_notes text
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
  if target_next_action is not null
    and char_length(target_next_action) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid next action';
  end if;
  if target_notes is not null
    and char_length(target_notes) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid notes';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  update public.career_applications
  set
    next_action = target_next_action,
    next_action_due_on = target_due_on,
    notes = target_notes,
    updated_at = clock_timestamp()
  where id = target_application_id and owner_id = actor_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'application not found';
  end if;
end;
$$;

revoke all on function public.update_career_application_plan(uuid, text, date, text) from public, anon;
grant execute on function public.update_career_application_plan(uuid, text, date, text) to authenticated;

create or replace function public.delete_career_application(
  target_application_id uuid
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

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  delete from public.career_applications
  where id = target_application_id and owner_id = actor_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'application not found';
  end if;
end;
$$;

revoke all on function public.delete_career_application(uuid) from public, anon;
grant execute on function public.delete_career_application(uuid) to authenticated;

-- Career deletion now also erases tracked applications and their audit trail.
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
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

commit;

begin;

create table public.career_job_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  decision text not null check (decision in ('saved', 'dismissed', 'considering')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_job_decisions_owner_job_unique unique (owner_id, job_id)
);

alter table public.career_job_decisions enable row level security;
alter table public.career_job_decisions force row level security;

create policy "approved users read own career job decisions"
on public.career_job_decisions for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_job_decisions from public, anon, authenticated;
grant select on public.career_job_decisions to authenticated;
grant all on public.career_job_decisions to service_role;

create or replace function public.decide_career_job(
  target_job_id uuid,
  target_decision text
)
returns text
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
  if target_decision not in ('saved', 'dismissed', 'considering', 'clear') then
    raise exception using errcode = '22023', message = 'invalid job decision';
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

  if target_decision = 'clear' then
    delete from public.career_job_decisions
    where owner_id = actor_user_id and job_id = target_job_id;
    return null;
  end if;

  insert into public.career_job_decisions (owner_id, job_id, decision)
  values (actor_user_id, target_job_id, target_decision)
  on conflict (owner_id, job_id) do update set
    decision = excluded.decision,
    updated_at = clock_timestamp();

  return target_decision;
end;
$$;

revoke all on function public.decide_career_job(uuid, text) from public, anon;
grant execute on function public.decide_career_job(uuid, text) to authenticated;

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
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

commit;

begin;

-- Curated pathway taxonomy reference. Rows must stay in lockstep with
-- careerPathways in packages/domain/src/explore.ts (guarded by a repository
-- test); membership here is the database boundary that keeps decisions and
-- the ownerless analytics free of arbitrary caller-supplied text.
create table public.explore_pathways (
  pathway_concept text primary key check (
    pathway_concept ~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'
    and char_length(pathway_concept) <= 120
  )
);

alter table public.explore_pathways enable row level security;
alter table public.explore_pathways force row level security;

revoke all on public.explore_pathways from public, anon, authenticated;
grant all on public.explore_pathways to service_role;

insert into public.explore_pathways (pathway_concept) values
  ('product analytics implementation'),
  ('event data governance'),
  ('analytics solutions consulting'),
  ('consent technology implementation'),
  ('technical customer success for analytics platforms'),
  ('marketing operations'),
  ('business intelligence development'),
  ('conversion rate optimisation');

-- Opt-in Explore state. Explore is disabled until the owner explicitly
-- enables it; mutations go through the owner-fenced RPC only.
create table public.career_explore_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.career_explore_settings enable row level security;
alter table public.career_explore_settings force row level security;

create policy "approved users read own explore settings"
on public.career_explore_settings for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_explore_settings from public, anon, authenticated;
grant select on public.career_explore_settings to authenticated;
grant all on public.career_explore_settings to service_role;

-- Owner decisions about suggested pathways. The concept is constrained to the
-- curated normalised-concept grammar so free text can never be stored.
create table public.career_pathway_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pathway_concept text not null
    references public.explore_pathways (pathway_concept) check (
      pathway_concept ~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'
      and char_length(pathway_concept) <= 120
    ),
  decision text not null check (decision in ('dismissed', 'promoted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint career_pathway_decisions_owner_concept_unique unique (owner_id, pathway_concept)
);

alter table public.career_pathway_decisions enable row level security;
alter table public.career_pathway_decisions force row level security;

create policy "approved users read own pathway decisions"
on public.career_pathway_decisions for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_pathway_decisions from public, anon, authenticated;
grant select on public.career_pathway_decisions to authenticated;
grant all on public.career_pathway_decisions to service_role;

-- Aggregate pathway analytics. Deliberately ownerless: only a constrained
-- pathway concept, a bounded event name, and a counter. No CV snippets or
-- identifying text can exist in this schema, and these counters survive
-- career-profile deletion because they identify nobody.
create table public.explore_pathway_analytics (
  pathway_concept text not null
    references public.explore_pathways (pathway_concept) check (
      pathway_concept ~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'
      and char_length(pathway_concept) <= 120
    ),
  event text not null check (event in ('dismissed', 'promoted')),
  event_count bigint not null default 0 check (event_count >= 0),
  primary key (pathway_concept, event)
);

alter table public.explore_pathway_analytics enable row level security;
alter table public.explore_pathway_analytics force row level security;

revoke all on public.explore_pathway_analytics from public, anon, authenticated;
grant all on public.explore_pathway_analytics to service_role;

create or replace function public.set_explore_enabled(
  target_enabled boolean
)
returns boolean
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

  insert into public.career_explore_settings (owner_id, enabled)
  values (actor_user_id, target_enabled)
  on conflict (owner_id) do update set
    enabled = excluded.enabled,
    updated_at = clock_timestamp();

  return target_enabled;
end;
$$;

revoke all on function public.set_explore_enabled(boolean) from public, anon;
grant execute on function public.set_explore_enabled(boolean) to authenticated;

create or replace function public.decide_career_pathway(
  target_pathway_concept text,
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
  if target_decision not in ('dismissed', 'promoted', 'clear') then
    raise exception using errcode = '22023', message = 'invalid pathway decision';
  end if;
  if target_pathway_concept is null
    or target_pathway_concept !~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'
    or char_length(target_pathway_concept) > 120
  then
    raise exception using errcode = '22023', message = 'invalid pathway concept';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  if not exists (
    select 1 from public.explore_pathways
    where pathway_concept = target_pathway_concept
  ) then
    raise exception using errcode = '22023', message = 'unknown pathway';
  end if;

  if target_decision = 'clear' then
    delete from public.career_pathway_decisions
    where owner_id = actor_user_id and pathway_concept = target_pathway_concept;
    return null;
  end if;

  insert into public.career_pathway_decisions (owner_id, pathway_concept, decision)
  values (actor_user_id, target_pathway_concept, target_decision)
  on conflict (owner_id, pathway_concept) do update set
    decision = excluded.decision,
    updated_at = clock_timestamp()
  where public.career_pathway_decisions.decision is distinct from excluded.decision;

  -- Append-only aggregate counter; counts state transitions only, so repeat
  -- toggles of the same decision never inflate it, and clear never decrements.
  if found then
    insert into public.explore_pathway_analytics (pathway_concept, event, event_count)
    values (target_pathway_concept, target_decision, 1)
    on conflict (pathway_concept, event) do update set
      event_count = public.explore_pathway_analytics.event_count + 1;
  end if;

  return target_decision;
end;
$$;

revoke all on function public.decide_career_pathway(text, text) from public, anon;
grant execute on function public.decide_career_pathway(text, text) to authenticated;

-- Career deletion now also erases explore opt-in state and pathway decisions.
-- Aggregate ownerless analytics counters are intentionally retained.
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
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

commit;

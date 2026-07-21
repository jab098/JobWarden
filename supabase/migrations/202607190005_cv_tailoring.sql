begin;

-- A tailored CV variant is stored as a list of paragraph operations against a
-- source document, never as a second binary. Regenerating on demand means
-- there is no extra file to secure, expire, or leak, and it makes corrupting
-- the user's original impossible by construction.
create table public.career_cv_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cv_document_id uuid not null,
  job_id uuid not null references public.jobs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'saved')),
  operations jsonb not null default '[]'::jsonb check (
    jsonb_typeof(operations) = 'array'
    and jsonb_array_length(operations) <= 500
    and octet_length(operations::text) <= 262144
  ),
  -- Unsaved variants expire after 24 hours; a saved variant has no expiry and
  -- remains the user's until they delete it.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (cv_document_id, owner_id)
    references public.cv_documents (id, user_id) on delete cascade,
  constraint career_cv_variants_expiry_matches_status check (
    (status = 'draft' and expires_at is not null)
    or (status = 'saved' and expires_at is null)
  ),
  constraint career_cv_variants_draft_unique unique (owner_id, cv_document_id, job_id, status)
);

alter table public.career_cv_variants enable row level security;
alter table public.career_cv_variants force row level security;

create policy "approved users read own cv variants"
on public.career_cv_variants for select to authenticated
using (owner_id = auth.uid() and public.has_approved_access());

revoke all on public.career_cv_variants from public, anon, authenticated;
grant select on public.career_cv_variants to authenticated;
grant all on public.career_cv_variants to service_role;

create index career_cv_variants_owner_idx
  on public.career_cv_variants (owner_id, updated_at desc);
create index career_cv_variants_job_idx on public.career_cv_variants (job_id);
create index career_cv_variants_expiry_idx
  on public.career_cv_variants (expires_at)
  where status = 'draft';

-- Validates the operation array's shape at the database boundary, so a crafted
-- client payload cannot store an instruction the editor would later act on.
create or replace function public.career_cv_operations_are_valid(
  operations_value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
    from jsonb_array_elements(operations_value) as operation
    where jsonb_typeof(operation) <> 'object'
      or not (operation ? 'paragraphIndex')
      or jsonb_typeof(operation -> 'paragraphIndex') <> 'number'
      or (operation ->> 'paragraphIndex')::numeric < 0
      or (operation ->> 'paragraphIndex')::numeric > 10000
      or (operation ->> 'paragraphIndex')::numeric
         <> floor((operation ->> 'paragraphIndex')::numeric)
      or coalesce(operation ->> 'kind', '') not in ('replace', 'omit')
      or (
        operation ->> 'kind' = 'replace'
        and (
          -- Presence is checked first, as it is for `paragraphIndex` above.
          -- Without it an absent key makes `jsonb_typeof` return NULL, the
          -- comparison NULL rather than true, and the operation valid.
          not (operation ? 'text')
          or jsonb_typeof(operation -> 'text') <> 'string'
          or char_length(operation ->> 'text') not between 1 and 4000
        )
      )
      or (operation ->> 'kind' = 'omit' and operation ? 'text')
  );
$$;

create or replace function public.save_cv_variant(
  target_document_id uuid,
  target_job_id uuid,
  variant_name text,
  operations_value jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  saved_variant_id uuid;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if char_length(coalesce(variant_name, '')) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid variant name';
  end if;
  if operations_value is null
    or jsonb_typeof(operations_value) <> 'array'
    or jsonb_array_length(operations_value) > 500
    or not public.career_cv_operations_are_valid(operations_value) then
    raise exception using errcode = '22023', message = 'invalid variant operations';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  -- Layout-preserving output requires a DOCX source that is still the user's
  -- current document.
  if not exists (
    select 1
    from public.cv_documents as document
    where document.id = target_document_id
      and document.user_id = actor_user_id
      and document.file_kind = 'docx'
      and document.is_current
      and document.lifecycle_status = 'ready'
  ) then
    raise exception using errcode = 'P0002', message = 'current docx source not found';
  end if;

  if not exists (select 1 from public.jobs where id = target_job_id) then
    raise exception using errcode = 'P0002', message = 'job not found';
  end if;

  insert into public.career_cv_variants (
    owner_id, cv_document_id, job_id, name, status, operations, expires_at
  )
  values (
    actor_user_id, target_document_id, target_job_id, variant_name, 'draft',
    operations_value, clock_timestamp() + interval '24 hours'
  )
  on conflict (owner_id, cv_document_id, job_id, status) do update
  set name = excluded.name,
      operations = excluded.operations,
      expires_at = excluded.expires_at,
      updated_at = clock_timestamp()
  returning id into saved_variant_id;

  return saved_variant_id;
end;
$$;

revoke all on function public.save_cv_variant(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.save_cv_variant(uuid, uuid, text, jsonb)
  to authenticated;

create or replace function public.promote_cv_variant(target_variant_id uuid)
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

  -- A saved variant for the same document and job is replaced, so promoting
  -- twice cannot collide with the unique constraint.
  delete from public.career_cv_variants as existing
  where existing.owner_id = actor_user_id
    and existing.status = 'saved'
    and (existing.cv_document_id, existing.job_id) = (
      select variant.cv_document_id, variant.job_id
      from public.career_cv_variants as variant
      where variant.id = target_variant_id and variant.owner_id = actor_user_id
    );

  update public.career_cv_variants
  set status = 'saved', expires_at = null, updated_at = clock_timestamp()
  where id = target_variant_id
    and owner_id = actor_user_id
    and status = 'draft';
  if not found then
    raise exception using errcode = 'P0002', message = 'draft variant not found';
  end if;
end;
$$;

revoke all on function public.promote_cv_variant(uuid) from public, anon;
grant execute on function public.promote_cv_variant(uuid) to authenticated;

create or replace function public.delete_cv_variant(target_variant_id uuid)
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

  delete from public.career_cv_variants
  where id = target_variant_id and owner_id = actor_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'variant not found';
  end if;
end;
$$;

revoke all on function public.delete_cv_variant(uuid) from public, anon;
grant execute on function public.delete_cv_variant(uuid) to authenticated;

-- Bounded retention sweep joining the existing hourly schedule.
create or replace function public.expire_cv_variants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count integer;
begin
  with expired as (
    delete from public.career_cv_variants
    where status = 'draft'
      and expires_at is not null
      and expires_at <= clock_timestamp()
    returning 1
  )
  select count(*)::integer into removed_count from expired;
  return removed_count;
end;
$$;

revoke all on function public.expire_cv_variants() from public, anon, authenticated;
grant execute on function public.expire_cv_variants() to service_role;

select cron.schedule(
  'jobwarden-cv-variant-expiry',
  '23 * * * *',
  'select public.expire_cv_variants()'
);

-- Career deletion now also erases tailored variants.
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
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

commit;

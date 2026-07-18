begin;

alter table private.app_settings
  add column career_cv_uploads_enabled boolean not null default false;

create or replace function public.career_cv_uploads_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select settings.career_cv_uploads_enabled
    from private.app_settings as settings
    where settings.singleton = true
  ), false);
$$;

create table public.career_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_seniority text not null default 'unspecified' check (
    current_seniority in (
      'entry', 'junior', 'mid', 'senior', 'lead', 'principal',
      'head', 'director', 'executive', 'unspecified'
    )
  ),
  target_seniority text not null default 'unspecified' check (
    target_seniority in (
      'entry', 'junior', 'mid', 'senior', 'lead', 'principal',
      'head', 'director', 'executive', 'unspecified'
    )
  ),
  explore_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cv_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.career_profiles (user_id) on delete cascade,
  storage_path text not null unique check (
    char_length(storage_path) between 38 and 500
    and split_part(storage_path, '/', 1) = user_id::text
    and storage_path !~ '(^|/)\.\.(/|$)'
  ),
  original_file_name text not null check (
    char_length(original_file_name) between 1 and 255
    and position('/' in original_file_name) = 0
    and position(chr(92) in original_file_name) = 0
    and original_file_name !~ '[[:cntrl:]]'
  ),
  file_kind text not null check (file_kind in ('docx', 'pdf')),
  media_type text not null check (
    media_type in (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf'
    )
  ),
  byte_size integer not null check (byte_size between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  lifecycle_status text not null default 'uploaded' check (
    lifecycle_status in ('uploaded', 'processing', 'ready', 'failed', 'deleted')
  ),
  is_current boolean not null default true,
  uploaded_at timestamptz not null default now(),
  replaced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint cv_documents_kind_media_match check (
    (file_kind = 'docx' and media_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or (file_kind = 'pdf' and media_type = 'application/pdf')
  ),
  constraint cv_documents_current_state check (
    (is_current and replaced_at is null and deleted_at is null and lifecycle_status <> 'deleted')
    or (not is_current)
  ),
  constraint cv_documents_deleted_state check (
    (lifecycle_status = 'deleted' and deleted_at is not null and not is_current)
    or lifecycle_status <> 'deleted'
  )
);

create unique index cv_documents_one_current_per_user_idx
  on public.cv_documents (user_id)
  where is_current;
create index cv_documents_user_uploaded_idx
  on public.cv_documents (user_id, uploaded_at desc);

create table public.career_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.career_profiles (user_id) on delete cascade,
  cv_document_id uuid,
  normalized_concept text not null check (
    char_length(normalized_concept) between 1 and 120
    and normalized_concept ~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'
  ),
  label text not null check (char_length(label) between 1 and 120),
  category text not null check (
    category in (
      'skill', 'tool', 'responsibility', 'industry', 'domain',
      'role_history', 'education', 'qualification'
    )
  ),
  origin text not null check (origin in ('cv', 'user')),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  evidence_reference text check (
    evidence_reference is null
    or char_length(evidence_reference) between 1 and 200
  ),
  evidence_excerpt text check (
    evidence_excerpt is null
    or char_length(evidence_excerpt) between 1 and 280
  ),
  proficiency_signal text not null check (
    proficiency_signal in ('demonstrated', 'working', 'advanced', 'unspecified')
  ),
  last_used_at date,
  confirmation_state text not null check (
    confirmation_state in ('proposed', 'confirmed', 'rejected')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (cv_document_id, user_id)
    references public.cv_documents (id, user_id) on delete cascade,
  unique (user_id, category, normalized_concept),
  constraint career_evidence_origin_reference check (
    (origin = 'cv' and cv_document_id is not null and evidence_reference is not null)
    or (origin = 'user' and cv_document_id is null)
  )
);

create table public.cv_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.career_profiles (user_id) on delete cascade,
  cv_document_id uuid not null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed')
  ),
  extractor_version text not null check (
    char_length(extractor_version) between 1 and 50
    and extractor_version ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  idempotency_key text not null check (
    char_length(idempotency_key) between 16 and 100
    and idempotency_key ~ '^[a-zA-Z0-9._:-]+$'
  ),
  proposal jsonb check (
    proposal is null
    or (
      jsonb_typeof(proposal) = 'object'
      and octet_length(proposal::text) <= 262144
    )
  ),
  evidence_count integer not null default 0 check (evidence_count between 0 and 250),
  suggestion_count integer not null default 0 check (suggestion_count between 0 and 100),
  input_character_count integer not null default 0 check (
    input_character_count between 0 and 100000
  ),
  error_code text check (
    error_code is null
    or error_code in (
      'invalid_file', 'unsupported_type', 'file_too_large', 'unsafe_archive',
      'encrypted_pdf', 'page_limit', 'extraction_timeout', 'storage_missing',
      'internal_error'
    )
  ),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),
  foreign key (cv_document_id, user_id)
    references public.cv_documents (id, user_id) on delete cascade,
  constraint cv_extraction_runs_result_state check (
    (status = 'succeeded' and proposal is not null and error_code is null and completed_at is not null)
    or (status = 'failed' and proposal is null and error_code is not null and completed_at is not null)
    or (status in ('queued', 'running') and proposal is null and error_code is null and completed_at is null)
  )
);

create index cv_extraction_runs_document_idx
  on public.cv_extraction_runs (cv_document_id, created_at desc);

create table public.profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.career_profiles (user_id) on delete cascade,
  extraction_run_id uuid not null,
  kind text not null check (
    kind in ('skill', 'role_family', 'seniority', 'career_pathway')
  ),
  normalized_concept text not null check (
    char_length(normalized_concept) between 1 and 120
    and normalized_concept ~ '^[a-z0-9][a-z0-9 .+#/&()''-]*$'
  ),
  label text not null check (char_length(label) between 1 and 120),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  evidence_item_ids uuid[] not null check (
    cardinality(evidence_item_ids) between 1 and 30
    and array_position(evidence_item_ids, null) is null
  ),
  state text not null default 'proposed' check (
    state in ('proposed', 'accepted', 'rejected')
  ),
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (extraction_run_id, user_id)
    references public.cv_extraction_runs (id, user_id) on delete cascade,
  unique (extraction_run_id, kind, normalized_concept),
  constraint profile_suggestions_decision_state check (
    (state = 'proposed' and decided_at is null)
    or (state in ('accepted', 'rejected') and decided_at is not null)
  )
);

create index profile_suggestions_user_state_idx
  on public.profile_suggestions (user_id, state, proposed_at desc);

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.career_profiles (user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  enabled boolean not null default true,
  role_families jsonb not null default '[]'::jsonb check (
    jsonb_typeof(role_families) = 'array'
    and jsonb_array_length(role_families) <= 20
    and octet_length(role_families::text) <= 8192
  ),
  include_terms text[] not null default '{}'::text[] check (
    cardinality(include_terms) <= 30 and array_position(include_terms, null) is null
  ),
  exclude_terms text[] not null default '{}'::text[] check (
    cardinality(exclude_terms) <= 30 and array_position(exclude_terms, null) is null
  ),
  industries jsonb not null default '[]'::jsonb check (
    jsonb_typeof(industries) = 'array'
    and jsonb_array_length(industries) <= 20
    and octet_length(industries::text) <= 8192
  ),
  domains jsonb not null default '[]'::jsonb check (
    jsonb_typeof(domains) = 'array'
    and jsonb_array_length(domains) <= 20
    and octet_length(domains::text) <= 8192
  ),
  skill_concepts text[] not null default '{}'::text[] check (
    cardinality(skill_concepts) <= 50 and array_position(skill_concepts, null) is null
  ),
  responsibility_concepts text[] not null default '{}'::text[] check (
    cardinality(responsibility_concepts) <= 50
    and array_position(responsibility_concepts, null) is null
  ),
  current_seniority text not null default 'unspecified' check (
    current_seniority in (
      'entry', 'junior', 'mid', 'senior', 'lead', 'principal',
      'head', 'director', 'executive', 'unspecified'
    )
  ),
  target_seniority text not null default 'unspecified' check (
    target_seniority in (
      'entry', 'junior', 'mid', 'senior', 'lead', 'principal',
      'head', 'director', 'executive', 'unspecified'
    )
  ),
  employment_types text[] not null default '{}'::text[] check (
    employment_types <@ array[
      'permanent', 'fixed_term', 'contract', 'temporary', 'apprenticeship',
      'internship', 'casual', 'zero_hours', 'unknown'
    ]::text[]
  ),
  working_times text[] not null default '{}'::text[] check (
    working_times <@ array['full_time', 'part_time', 'flexible', 'unknown']::text[]
  ),
  workplace_types text[] not null default '{}'::text[] check (
    workplace_types <@ array['onsite', 'hybrid', 'remote', 'unknown']::text[]
  ),
  uk_locations text[] not null default '{}'::text[] check (
    cardinality(uk_locations) <= 30 and array_position(uk_locations, null) is null
  ),
  ir35_statuses text[] not null default '{}'::text[] check (
    ir35_statuses <@ array['inside', 'outside', 'not_applicable', 'unknown']::text[]
  ),
  compensation_minimum integer check (compensation_minimum is null or compensation_minimum >= 0),
  compensation_maximum integer check (compensation_maximum is null or compensation_maximum >= 0),
  compensation_period text not null default 'unknown' check (
    compensation_period in ('hour', 'day', 'week', 'month', 'year', 'unknown')
  ),
  allow_unknown_compensation boolean not null default true,
  recency_days integer not null default 30 check (recency_days in (1, 3, 7, 14, 30)),
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  constraint search_profiles_compensation_range check (
    compensation_minimum is null
    or compensation_maximum is null
    or compensation_minimum <= compensation_maximum
  ),
  constraint search_profiles_signal_required check (
    jsonb_array_length(role_families) > 0
    or cardinality(include_terms) > 0
    or jsonb_array_length(industries) > 0
    or jsonb_array_length(domains) > 0
    or cardinality(skill_concepts) > 0
    or cardinality(responsibility_concepts) > 0
  )
);

alter table public.career_profiles enable row level security;
alter table public.career_profiles force row level security;
alter table public.career_evidence_items enable row level security;
alter table public.career_evidence_items force row level security;
alter table public.profile_suggestions enable row level security;
alter table public.profile_suggestions force row level security;
alter table public.search_profiles enable row level security;
alter table public.search_profiles force row level security;
alter table public.cv_documents enable row level security;
alter table public.cv_documents force row level security;
alter table public.cv_extraction_runs enable row level security;
alter table public.cv_extraction_runs force row level security;

create policy "approved users manage own career profiles"
on public.career_profiles for all to authenticated
using (user_id = auth.uid() and public.has_approved_access())
with check (user_id = auth.uid() and public.has_approved_access());

create policy "approved users read own career evidence"
on public.career_evidence_items for select to authenticated
using (user_id = auth.uid() and public.has_approved_access());

create policy "approved users add own career evidence"
on public.career_evidence_items for insert to authenticated
with check (
  origin = 'user' and user_id = auth.uid() and public.has_approved_access()
);

create policy "approved users review own career evidence"
on public.career_evidence_items for update to authenticated
using (user_id = auth.uid() and public.has_approved_access())
with check (user_id = auth.uid() and public.has_approved_access());

create policy "approved users delete own career evidence"
on public.career_evidence_items for delete to authenticated
using (user_id = auth.uid() and public.has_approved_access());

create policy "approved users manage own search profiles"
on public.search_profiles for all to authenticated
using (user_id = auth.uid() and public.has_approved_access())
with check (user_id = auth.uid() and public.has_approved_access());

create policy "approved users read own profile suggestions"
on public.profile_suggestions for select to authenticated
using (user_id = auth.uid() and public.has_approved_access());

create policy "approved users read own cv documents"
on public.cv_documents for select to authenticated
using (user_id = auth.uid() and public.has_approved_access());

create policy "approved users read own cv extraction runs"
on public.cv_extraction_runs for select to authenticated
using (user_id = auth.uid() and public.has_approved_access());

create or replace function public.register_cv_document(
  storage_path_value text,
  original_file_name_value text,
  file_kind_value text,
  media_type_value text,
  byte_size_value integer,
  sha256_value text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  document_id uuid;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if not public.career_cv_uploads_enabled() then
    raise exception using errcode = '42501', message = 'CV uploads disabled';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text, 0)
  );

  insert into public.career_profiles (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;

  update public.cv_documents
  set
    is_current = false,
    replaced_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where user_id = actor_user_id and is_current;

  insert into public.cv_documents (
    user_id,
    storage_path,
    original_file_name,
    file_kind,
    media_type,
    byte_size,
    sha256
  )
  values (
    actor_user_id,
    storage_path_value,
    original_file_name_value,
    file_kind_value,
    media_type_value,
    byte_size_value,
    sha256_value
  )
  returning id into document_id;

  return document_id;
end;
$$;

create or replace function public.decide_profile_suggestion(
  target_suggestion_id uuid,
  target_state text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_state text;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;

  if target_state not in ('accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid suggestion decision';
  end if;

  select state
  into current_state
  from public.profile_suggestions
  where id = target_suggestion_id and user_id = actor_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile suggestion not found';
  end if;

  if current_state = target_state then
    return current_state;
  end if;

  if current_state <> 'proposed' then
    raise exception using errcode = '22023', message = 'suggestion already decided';
  end if;

  update public.profile_suggestions
  set
    state = target_state,
    decided_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = target_suggestion_id;

  return target_state;
end;
$$;

revoke all on function public.register_cv_document(text, text, text, text, integer, text)
  from public, anon;
revoke all on function public.decide_profile_suggestion(uuid, text)
  from public, anon;
revoke all on function public.career_cv_uploads_enabled()
  from public, anon;
grant execute on function public.register_cv_document(text, text, text, text, integer, text)
  to authenticated;
grant execute on function public.decide_profile_suggestion(uuid, text) to authenticated;
grant execute on function public.career_cv_uploads_enabled() to authenticated;

revoke all on public.career_profiles, public.career_evidence_items,
  public.profile_suggestions, public.search_profiles, public.cv_documents,
  public.cv_extraction_runs from public, anon, authenticated;

grant select, insert, update on public.career_profiles to authenticated;
grant select, insert, update, delete on public.search_profiles to authenticated;
grant select, insert, delete on public.career_evidence_items to authenticated;
grant update (confirmation_state, proficiency_signal, last_used_at)
  on public.career_evidence_items to authenticated;
grant select on public.profile_suggestions, public.cv_documents,
  public.cv_extraction_runs to authenticated;
grant all on public.career_profiles, public.career_evidence_items,
  public.profile_suggestions, public.search_profiles, public.cv_documents,
  public.cv_extraction_runs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'career-documents',
  'career-documents',
  false,
  5242880,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "approved users read own career documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'career-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_access()
);

create policy "approved users upload own career documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'career-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_access()
  and public.career_cv_uploads_enabled()
);

create policy "approved users replace own career documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'career-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_access()
  and public.career_cv_uploads_enabled()
)
with check (
  bucket_id = 'career-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_access()
  and public.career_cv_uploads_enabled()
);

create policy "approved users delete own career documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'career-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_approved_access()
);

commit;

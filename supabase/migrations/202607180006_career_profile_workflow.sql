begin;

alter table public.career_profiles
  add column target_role_families jsonb not null default '[]'::jsonb check (
    jsonb_typeof(target_role_families) = 'array'
    and jsonb_array_length(target_role_families) <= 20
    and octet_length(target_role_families::text) <= 8192
  ),
  add column industries jsonb not null default '[]'::jsonb check (
    jsonb_typeof(industries) = 'array'
    and jsonb_array_length(industries) <= 20
    and octet_length(industries::text) <= 8192
  ),
  add column domains jsonb not null default '[]'::jsonb check (
    jsonb_typeof(domains) = 'array'
    and jsonb_array_length(domains) <= 20
    and octet_length(domains::text) <= 8192
  ),
  add column keywords text[] not null default '{}'::text[] check (
    cardinality(keywords) <= 30 and array_position(keywords, null) is null
  );

create or replace function private.prune_search_profile_evidence(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.career_profile_generations (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = target_user_id
  for update;

  delete from public.search_profiles as search
  where search.user_id = target_user_id
    and jsonb_array_length(search.role_families) = 0
    and cardinality(search.include_terms) = 0
    and jsonb_array_length(search.industries) = 0
    and jsonb_array_length(search.domains) = 0
    and not exists (
      select 1
      from unnest(search.skill_concepts) as concept
      join public.career_evidence_items as evidence
        on evidence.user_id = target_user_id
        and evidence.confirmation_state = 'confirmed'
        and evidence.category in ('skill', 'tool')
        and evidence.normalized_concept = concept
    )
    and not exists (
      select 1
      from unnest(search.responsibility_concepts) as concept
      join public.career_evidence_items as evidence
        on evidence.user_id = target_user_id
        and evidence.confirmation_state = 'confirmed'
        and evidence.category = 'responsibility'
        and evidence.normalized_concept = concept
    );

  update public.search_profiles as search
  set
    skill_concepts = array(
      select concept
      from unnest(search.skill_concepts) as concept
      where exists (
        select 1 from public.career_evidence_items as evidence
        where evidence.user_id = target_user_id
          and evidence.confirmation_state = 'confirmed'
          and evidence.category in ('skill', 'tool')
          and evidence.normalized_concept = concept
      )
    ),
    responsibility_concepts = array(
      select concept
      from unnest(search.responsibility_concepts) as concept
      where exists (
        select 1 from public.career_evidence_items as evidence
        where evidence.user_id = target_user_id
          and evidence.confirmation_state = 'confirmed'
          and evidence.category = 'responsibility'
          and evidence.normalized_concept = concept
      )
    ),
    updated_at = clock_timestamp()
  where search.user_id = target_user_id;
end;
$$;

create or replace function private.prune_search_profile_evidence_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.prune_search_profile_evidence(old.user_id);
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    perform private.prune_search_profile_evidence(new.user_id);
  end if;
  return null;
end;
$$;

create trigger prune_search_profile_evidence_after_change
after delete or update of confirmation_state, category, normalized_concept
on public.career_evidence_items
for each row execute function private.prune_search_profile_evidence_after_change();

revoke all on function private.prune_search_profile_evidence(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.prune_search_profile_evidence_after_change()
  from public, anon, authenticated, service_role;

create or replace function public.get_career_profile_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;

  return jsonb_build_object(
    'generation', coalesce((
      select fence.generation
      from public.career_profile_generations as fence
      where fence.user_id = actor_user_id
    ), 0),
    'profile', (
      select to_jsonb(profile)
      from public.career_profiles as profile
      where profile.user_id = actor_user_id
    ),
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(evidence) order by evidence.created_at, evidence.id)
      from public.career_evidence_items as evidence
      where evidence.user_id = actor_user_id
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(to_jsonb(suggestion) order by suggestion.proposed_at, suggestion.id)
      from public.profile_suggestions as suggestion
      where suggestion.user_id = actor_user_id
    ), '[]'::jsonb),
    'searches', coalesce((
      select jsonb_agg(to_jsonb(search) order by search.created_at, search.id)
      from public.search_profiles as search
      where search.user_id = actor_user_id
    ), '[]'::jsonb),
    'cvs', coalesce((
      select jsonb_agg(to_jsonb(document) order by document.uploaded_at, document.id)
      from public.cv_documents as document
      where document.user_id = actor_user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_career_profile_draft(
  expected_generation bigint,
  draft_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  cv_document_id_value uuid;
  current_seniority_value text;
  target_seniority_value text;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if expected_generation < 0 then
    raise exception using errcode = '22023', message = 'invalid profile generation';
  end if;
  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
    and fence.generation = expected_generation
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'stale career profile snapshot';
  end if;
  if jsonb_typeof(draft_value) <> 'object'
    or octet_length(draft_value::text) > 131072
    or jsonb_typeof(draft_value -> 'targetRoleFamilies') <> 'array'
    or jsonb_typeof(draft_value -> 'industries') <> 'array'
    or jsonb_typeof(draft_value -> 'domains') <> 'array'
    or jsonb_typeof(draft_value -> 'keywords') <> 'array'
    or jsonb_typeof(draft_value -> 'evidence') <> 'array'
    or jsonb_array_length(draft_value -> 'targetRoleFamilies') > 20
    or jsonb_array_length(draft_value -> 'industries') > 20
    or jsonb_array_length(draft_value -> 'domains') > 20
    or jsonb_array_length(draft_value -> 'keywords') > 30
    or jsonb_array_length(draft_value -> 'evidence') > 250 then
    raise exception using errcode = '22023', message = 'invalid career profile draft';
  end if;

  current_seniority_value := draft_value ->> 'currentSeniority';
  target_seniority_value := draft_value ->> 'targetSeniority';
  cv_document_id_value := nullif(draft_value ->> 'cvDocumentId', '')::uuid;
  if current_seniority_value not in (
    'entry', 'junior', 'mid', 'senior', 'lead', 'principal',
    'head', 'director', 'executive', 'unspecified'
  ) or target_seniority_value not in (
    'entry', 'junior', 'mid', 'senior', 'lead', 'principal',
    'head', 'director', 'executive', 'unspecified'
  ) then
    raise exception using errcode = '22023', message = 'invalid seniority';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      (draft_value -> 'targetRoleFamilies')
      || (draft_value -> 'industries')
      || (draft_value -> 'domains')
    ) as concept
    where jsonb_typeof(concept) <> 'object'
      or (concept ->> 'normalizedConcept') !~ '^[a-z0-9][a-z0-9 .+#/&()''-]{0,119}$'
      or char_length(concept ->> 'label') not between 1 and 120
  ) or exists (
    select 1 from jsonb_array_elements_text(draft_value -> 'keywords') as keyword
    where char_length(keyword) not between 1 and 80
  ) then
    raise exception using errcode = '22023', message = 'invalid profile concept';
  end if;

  if cv_document_id_value is not null and not exists (
    select 1
    from public.cv_documents as document
    where document.id = cv_document_id_value
      and document.user_id = actor_user_id
      and document.is_current
      and document.deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'invalid CV reference';
  end if;
  if cv_document_id_value is null
    and jsonb_array_length(draft_value -> 'targetRoleFamilies') = 0
    and jsonb_array_length(draft_value -> 'industries') = 0
    and jsonb_array_length(draft_value -> 'domains') = 0
    and jsonb_array_length(draft_value -> 'keywords') = 0
    and not exists (
      select 1
      from jsonb_array_elements(draft_value -> 'evidence') as item
      where item ->> 'origin' = 'user'
    ) then
    raise exception using errcode = '22023', message = 'profile signal required';
  end if;

  insert into public.career_profiles (
    user_id,
    current_seniority,
    target_seniority,
    target_role_families,
    industries,
    domains,
    keywords,
    updated_at
  ) values (
    actor_user_id,
    current_seniority_value,
    target_seniority_value,
    draft_value -> 'targetRoleFamilies',
    draft_value -> 'industries',
    draft_value -> 'domains',
    array(select jsonb_array_elements_text(draft_value -> 'keywords')),
    clock_timestamp()
  )
  on conflict (user_id) do update set
    current_seniority = excluded.current_seniority,
    target_seniority = excluded.target_seniority,
    target_role_families = excluded.target_role_families,
    industries = excluded.industries,
    domains = excluded.domains,
    keywords = excluded.keywords,
    updated_at = clock_timestamp();

  delete from public.career_evidence_items as evidence
  where evidence.user_id = actor_user_id
    and evidence.origin = 'user'
    and not exists (
      select 1
      from jsonb_array_elements(draft_value -> 'evidence') as item
      where item ->> 'origin' = 'user'
        and (item ->> 'id')::uuid = evidence.id
    );

  insert into public.career_evidence_items (
    id,
    user_id,
    normalized_concept,
    label,
    category,
    origin,
    confidence,
    evidence_reference,
    evidence_excerpt,
    proficiency_signal,
    last_used_at,
    confirmation_state
  )
  select
    item."id",
    actor_user_id,
    item."normalizedConcept",
    item."label",
    item."category",
    'user',
    item."confidence",
    null,
    item."evidenceExcerpt",
    item."proficiencySignal",
    nullif(item."lastUsedAt", '')::date,
    item."confirmationState"
  from jsonb_to_recordset(draft_value -> 'evidence') as item(
    "id" uuid,
    "normalizedConcept" text,
    "label" text,
    "category" text,
    "origin" text,
    "confidence" numeric,
    "evidenceReference" text,
    "evidenceExcerpt" text,
    "proficiencySignal" text,
    "lastUsedAt" text,
    "confirmationState" text
  )
  where item."origin" = 'user'
    and item."evidenceReference" is null
  on conflict (id) do update set
    normalized_concept = excluded.normalized_concept,
    label = excluded.label,
    category = excluded.category,
    confidence = excluded.confidence,
    evidence_excerpt = excluded.evidence_excerpt,
    proficiency_signal = excluded.proficiency_signal,
    last_used_at = excluded.last_used_at,
    confirmation_state = excluded.confirmation_state,
    updated_at = clock_timestamp()
  where career_evidence_items.user_id = actor_user_id
    and career_evidence_items.origin = 'user';

  perform private.prune_search_profile_evidence(actor_user_id);
end;
$$;

create or replace function public.save_search_profile(
  target_search_id uuid,
  expected_generation bigint,
  draft_value jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  saved_search_id uuid;
  requested_skill_concepts text[];
  requested_responsibility_concepts text[];
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if expected_generation < 0 then
    raise exception using errcode = '22023', message = 'invalid profile generation';
  end if;
  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
    and fence.generation = expected_generation
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'stale career profile snapshot';
  end if;
  insert into public.career_profiles (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  if jsonb_typeof(draft_value) <> 'object'
    or octet_length(draft_value::text) > 65536
    or char_length(draft_value ->> 'name') not between 1 and 80
    or jsonb_typeof(draft_value -> 'skillConcepts') <> 'array'
    or jsonb_typeof(draft_value -> 'responsibilityConcepts') <> 'array' then
    raise exception using errcode = '22023', message = 'invalid search profile';
  end if;

  requested_skill_concepts := array(
    select jsonb_array_elements_text(draft_value -> 'skillConcepts')
  );
  requested_responsibility_concepts := array(
    select jsonb_array_elements_text(draft_value -> 'responsibilityConcepts')
  );

  if not public.text_array_has_unique_values(requested_skill_concepts)
    or not public.text_array_has_unique_values(requested_responsibility_concepts) then
    raise exception using errcode = '22023', message = 'search evidence concepts must be unique';
  end if;

  if exists (
    select 1
    from unnest(requested_skill_concepts) as requested(concept)
    where not exists (
      select 1
      from public.career_evidence_items as evidence
      where evidence.user_id = actor_user_id
        and evidence.confirmation_state = 'confirmed'
        and evidence.category in ('skill', 'tool')
        and evidence.normalized_concept = requested.concept
    )
  ) or exists (
    select 1
    from unnest(requested_responsibility_concepts) as requested(concept)
    where not exists (
      select 1
      from public.career_evidence_items as evidence
      where evidence.user_id = actor_user_id
        and evidence.confirmation_state = 'confirmed'
        and evidence.category = 'responsibility'
        and evidence.normalized_concept = requested.concept
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'search evidence must be confirmed owner evidence';
  end if;

  if target_search_id is not null and not exists (
    select 1
    from public.search_profiles as search
    where search.id = target_search_id and search.user_id = actor_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'search profile not found';
  end if;

  insert into public.search_profiles as existing_search (
    id,
    user_id,
    name,
    enabled,
    role_families,
    include_terms,
    exclude_terms,
    industries,
    domains,
    skill_concepts,
    responsibility_concepts,
    current_seniority,
    target_seniority,
    employment_types,
    working_times,
    workplace_types,
    uk_locations,
    ir35_statuses,
    compensation_minimum,
    compensation_maximum,
    compensation_period,
    allow_unknown_compensation,
    recency_days,
    notifications_enabled,
    updated_at
  ) values (
    coalesce(target_search_id, gen_random_uuid()),
    actor_user_id,
    draft_value ->> 'name',
    (draft_value ->> 'enabled')::boolean,
    draft_value -> 'roleFamilies',
    array(select jsonb_array_elements_text(draft_value -> 'includeTerms')),
    array(select jsonb_array_elements_text(draft_value -> 'excludeTerms')),
    draft_value -> 'industries',
    draft_value -> 'domains',
    requested_skill_concepts,
    requested_responsibility_concepts,
    draft_value ->> 'currentSeniority',
    draft_value ->> 'targetSeniority',
    array(select jsonb_array_elements_text(draft_value -> 'employmentTypes')),
    array(select jsonb_array_elements_text(draft_value -> 'workingTimes')),
    array(select jsonb_array_elements_text(draft_value -> 'workplaceTypes')),
    array(select jsonb_array_elements_text(draft_value -> 'ukLocations')),
    array(select jsonb_array_elements_text(draft_value -> 'ir35Statuses')),
    nullif(draft_value #>> '{compensation,minimum}', '')::integer,
    nullif(draft_value #>> '{compensation,maximum}', '')::integer,
    draft_value #>> '{compensation,period}',
    (draft_value #>> '{compensation,allowUnknown}')::boolean,
    (draft_value ->> 'recencyDays')::integer,
    (draft_value ->> 'notificationsEnabled')::boolean,
    clock_timestamp()
  )
  on conflict (id) do update set
    name = excluded.name,
    enabled = excluded.enabled,
    role_families = excluded.role_families,
    include_terms = excluded.include_terms,
    exclude_terms = excluded.exclude_terms,
    industries = excluded.industries,
    domains = excluded.domains,
    skill_concepts = excluded.skill_concepts,
    responsibility_concepts = excluded.responsibility_concepts,
    current_seniority = excluded.current_seniority,
    target_seniority = excluded.target_seniority,
    employment_types = excluded.employment_types,
    working_times = excluded.working_times,
    workplace_types = excluded.workplace_types,
    uk_locations = excluded.uk_locations,
    ir35_statuses = excluded.ir35_statuses,
    compensation_minimum = excluded.compensation_minimum,
    compensation_maximum = excluded.compensation_maximum,
    compensation_period = excluded.compensation_period,
    allow_unknown_compensation = excluded.allow_unknown_compensation,
    recency_days = excluded.recency_days,
    notifications_enabled = excluded.notifications_enabled,
    updated_at = clock_timestamp()
  where existing_search.user_id = actor_user_id
  returning existing_search.id into saved_search_id;

  if saved_search_id is null then
    raise exception using errcode = 'P0002', message = 'search profile not found';
  end if;

  return saved_search_id;
end;
$$;

create or replace function public.delete_current_cv(
  target_document_id uuid,
  expected_storage_path text
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

  if not exists (
    select 1
    from public.cv_documents as document
    where document.id = target_document_id
      and document.user_id = actor_user_id
      and document.storage_path = expected_storage_path
      and document.is_current
  ) then
    raise exception using errcode = 'P0002', message = 'current CV not found';
  end if;

  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'career-documents'
      and object.name = expected_storage_path
  ) then
    raise exception using
      errcode = '23503',
      message = 'Storage object must be removed first';
  end if;

  delete from public.cv_documents
  where id = target_document_id
    and user_id = actor_user_id
    and storage_path = expected_storage_path
    and is_current;
  if not found then
    raise exception using errcode = 'P0002', message = 'current CV not found';
  end if;
end;
$$;

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
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

revoke all on function public.get_career_profile_snapshot() from public, anon;
revoke all on function public.save_career_profile_draft(bigint, jsonb) from public, anon;
revoke all on function public.save_search_profile(uuid, bigint, jsonb) from public, anon;
revoke all on function public.delete_current_cv(uuid, text) from public, anon;
revoke all on function public.delete_career_profile_data() from public, anon;
grant execute on function public.get_career_profile_snapshot(),
  public.save_career_profile_draft(bigint, jsonb),
  public.save_search_profile(uuid, bigint, jsonb), public.delete_current_cv(uuid, text),
  public.delete_career_profile_data() to authenticated;

commit;

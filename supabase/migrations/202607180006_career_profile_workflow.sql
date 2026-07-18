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

create or replace function public.save_career_profile_draft(draft_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_seniority_value text;
  target_seniority_value text;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
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

  delete from public.career_evidence_items
  where user_id = actor_user_id and origin = 'user';

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
  on conflict do nothing;
end;
$$;

create or replace function public.save_search_profile(draft_value jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  saved_search_id uuid;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if jsonb_typeof(draft_value) <> 'object'
    or octet_length(draft_value::text) > 65536
    or char_length(draft_value ->> 'name') not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid search profile';
  end if;

  insert into public.search_profiles (
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
    actor_user_id,
    draft_value ->> 'name',
    (draft_value ->> 'enabled')::boolean,
    draft_value -> 'roleFamilies',
    array(select jsonb_array_elements_text(draft_value -> 'includeTerms')),
    array(select jsonb_array_elements_text(draft_value -> 'excludeTerms')),
    draft_value -> 'industries',
    draft_value -> 'domains',
    array(select jsonb_array_elements_text(draft_value -> 'skillConcepts')),
    array(select jsonb_array_elements_text(draft_value -> 'responsibilityConcepts')),
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
  on conflict (user_id, name) do update set
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
  returning id into saved_search_id;

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
  delete from public.career_profiles where user_id = actor_user_id;
end;
$$;

revoke all on function public.save_career_profile_draft(jsonb) from public, anon;
revoke all on function public.save_search_profile(jsonb) from public, anon;
revoke all on function public.delete_current_cv(uuid, text) from public, anon;
revoke all on function public.delete_career_profile_data() from public, anon;
grant execute on function public.save_career_profile_draft(jsonb),
  public.save_search_profile(jsonb), public.delete_current_cv(uuid, text),
  public.delete_career_profile_data() to authenticated;

commit;

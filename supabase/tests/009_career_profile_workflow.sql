begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

select has_column('public', 'career_profiles', 'target_role_families', 'target role families persist');
select has_column('public', 'career_profiles', 'industries', 'industry preferences persist');
select has_column('public', 'career_profiles', 'domains', 'domain preferences persist');
select has_column('public', 'career_profiles', 'keywords', 'profile keywords persist');
select has_function(
  'public', 'get_career_profile_snapshot', array[]::text[],
  'one atomic owner-derived profile snapshot exists'
);
select has_function(
  'public', 'save_career_profile_draft', array['bigint', 'jsonb'],
  'the generation-fenced profile save exists'
);
select has_function(
  'public', 'save_search_profile', array['uuid', 'bigint', 'jsonb'],
  'the generation-fenced named search save exists'
);
select has_function(
  'public', 'delete_current_cv', array['uuid', 'text'],
  'race-safe current CV deletion exists'
);
select has_function(
  'public', 'delete_career_profile_data', array[]::text[],
  'owner-derived profile deletion exists'
);
select ok(
  not has_function_privilege(
    'anon', 'public.save_career_profile_draft(bigint,jsonb)', 'EXECUTE'
  ),
  'anonymous callers cannot save profile drafts'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.save_career_profile_draft(bigint,jsonb)', 'EXECUTE'
  ),
  'authenticated owners can save profile drafts'
);
select ok(
  not has_function_privilege(
    'anon', 'public.save_search_profile(uuid,bigint,jsonb)', 'EXECUTE'
  ),
  'anonymous callers cannot save named searches'
);
select ok(
  not has_function_privilege('anon', 'public.delete_current_cv(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot delete CV metadata'
);
select ok(
  not has_function_privilege('anon', 'public.delete_career_profile_data()', 'EXECUTE'),
  'anonymous callers cannot delete profile data'
);
select throws_ok(
  $$ select public.save_career_profile_draft(0, '{}'::jsonb) $$,
  '42501',
  null,
  'profile save requires an authenticated approved actor'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'search-owner@example.test', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Search owner"}', now(), now()
);
update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
where user_id = '90000000-0000-4000-8000-000000000001';
insert into public.career_profiles (user_id)
values ('90000000-0000-4000-8000-000000000001');
insert into public.career_evidence_items (
  id, user_id, normalized_concept, label, category, origin, confidence,
  proficiency_signal, confirmation_state
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    'sql', 'SQL', 'tool', 'user', 1, 'working', 'confirmed'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000001',
    'tableau', 'Tableau', 'tool', 'user', 1, 'working', 'proposed'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000001',
    'analytics implementation', 'Analytics implementation', 'responsibility',
    'user', 1, 'advanced', 'confirmed'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ select public.save_search_profile(
    null,
    0,
    '{"name":"Unconfirmed","enabled":true,"roleFamilies":[],"includeTerms":[],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["tableau"],"responsibilityConcepts":[],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
  ) $$,
  '22023',
  'search evidence must be confirmed owner evidence',
  'unconfirmed search evidence is rejected at the database boundary'
);
select throws_ok(
  $$ select public.save_search_profile(
    null,
    0,
    '{"name":"Invented","enabled":true,"roleFamilies":[],"includeTerms":[],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["invented concept"],"responsibilityConcepts":[],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
  ) $$,
  '22023',
  'search evidence must be confirmed owner evidence',
  'invented search evidence is rejected at the database boundary'
);
select throws_ok(
  $$ select public.save_search_profile(
    null,
    0,
    '{"name":"Duplicate skill","enabled":true,"roleFamilies":[],"includeTerms":["fallback"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["sql","sql"],"responsibilityConcepts":[],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
  ) $$,
  '22023',
  'search evidence concepts must be unique',
  'crafted RPC input cannot persist duplicate skill concepts'
);
select throws_ok(
  $$ select public.save_search_profile(
    null,
    0,
    '{"name":"Duplicate responsibility","enabled":true,"roleFamilies":[],"includeTerms":["fallback"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":[],"responsibilityConcepts":["analytics implementation","analytics implementation"],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
  ) $$,
  '22023',
  'search evidence concepts must be unique',
  'crafted RPC input cannot persist duplicate responsibility concepts'
);

create temporary table saved_search as
select public.save_search_profile(
  null,
  0,
  '{"name":"Confirmed evidence","enabled":true,"roleFamilies":[],"includeTerms":["implementation"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["sql"],"responsibilityConcepts":["analytics implementation"],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
) as id;
select ok((select id is not null from saved_search), 'confirmed owner evidence can seed a search');
select is(
  (
    select skill_concepts || responsibility_concepts
    from public.search_profiles
    where id = (select id from saved_search)
  ),
  array['sql', 'analytics implementation'],
  'the saved search contains only confirmed matching evidence'
);
select is(
  public.save_search_profile(
    (select id from saved_search),
    0,
    '{"name":"Renamed explicit search","enabled":true,"roleFamilies":[],"includeTerms":["implementation"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["sql"],"responsibilityConcepts":["analytics implementation"],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
  ),
  (select id from saved_search),
  'an explicit owner-bound search ID selects the row to update'
);

select lives_ok(
  $$ delete from public.career_evidence_items
     where id = '91000000-0000-4000-8000-000000000001' $$,
  'an owner can remove confirmed user evidence'
);
select is(
  (select skill_concepts from public.search_profiles where id = (select id from saved_search)),
  array[]::text[],
  'direct evidence removal transactionally prunes saved search skills'
);
select lives_ok(
  $$ select public.save_career_profile_draft(
    0,
    '{"cvDocumentId":null,"currentSeniority":"senior","targetSeniority":"lead","targetRoleFamilies":[{"normalizedConcept":"analytics implementation","label":"Analytics implementation"}],"industries":[],"domains":[],"keywords":[],"evidence":[]}'::jsonb
  ) $$,
  'a profile draft can remove omitted user evidence'
);
select is(
  (
    select responsibility_concepts
    from public.search_profiles
    where id = (select id from saved_search)
  ),
  array[]::text[],
  'user draft replacement transactionally prunes saved responsibilities'
);

select lives_ok(
  $$ insert into public.career_evidence_items (
    id, user_id, normalized_concept, label, category, origin, confidence,
    proficiency_signal, confirmation_state
  ) values (
    '91000000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000001',
    'typescript', 'TypeScript', 'tool', 'user', 1, 'working', 'confirmed'
  ) $$,
  'an owner can add replacement confirmed evidence'
);
create temporary table evidence_only_search as
select public.save_search_profile(
  null,
  0,
  '{"name":"Evidence only","enabled":true,"roleFamilies":[],"includeTerms":[],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":["typescript"],"responsibilityConcepts":[],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
) as id;
select lives_ok(
  $$ delete from public.career_evidence_items
     where id = '91000000-0000-4000-8000-000000000004' $$,
  'removing the final search signal does not block evidence deletion'
);
select is(
  (
    select count(*)::integer
    from public.search_profiles
    where id = (select id from evidence_only_search)
  ),
  0,
  'an evidence-only search is invalidated when its final confirmed signal disappears'
);

reset role;
set local role service_role;
insert into public.cv_documents (
  id, user_id, storage_path, original_file_name, file_kind, media_type,
  byte_size, sha256, lifecycle_status, is_current
)
values (
  '92000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001/current.docx',
  'current.docx', 'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  100, repeat('a', 64), 'ready', true
);
insert into public.career_evidence_items (
  id, user_id, cv_document_id, normalized_concept, label, category, origin,
  confidence, evidence_reference, proficiency_signal, confirmation_state
)
values (
  '91000000-0000-4000-8000-000000000005',
  '90000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'cv delivery', 'CV delivery', 'responsibility', 'cv', 1,
  'paragraph:1', 'advanced', 'confirmed'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
create temporary table cv_search as
select public.save_search_profile(
  null,
  0,
  '{"name":"CV evidence","enabled":true,"roleFamilies":[],"includeTerms":["delivery"],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":[],"responsibilityConcepts":["cv delivery"],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
) as id;
select lives_ok(
  $$ select public.delete_current_cv(
    '92000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001/current.docx'
  ) $$,
  'current CV metadata can be deleted after Storage is absent'
);
select is(
  (
    select responsibility_concepts
    from public.search_profiles
    where id = (select id from cv_search)
  ),
  array[]::text[],
  'CV evidence cascade transactionally prunes saved responsibilities'
);

reset role;
set local role service_role;
select throws_ok(
  $$ insert into public.search_profiles (
    user_id, name, include_terms, skill_concepts
  ) values (
    '90000000-0000-4000-8000-000000000001',
    'Crafted duplicate skills', array['fallback'], array['sql', 'sql']
  ) $$,
  '23514',
  null,
  'table constraints reject duplicate skill concepts even outside the RPC'
);
select throws_ok(
  $$ insert into public.search_profiles (
    user_id, name, include_terms, responsibility_concepts
  ) values (
    '90000000-0000-4000-8000-000000000001',
    'Crafted duplicate responsibilities', array['fallback'],
    array['delivery', 'delivery']
  ) $$,
  '23514',
  null,
  'table constraints reject duplicate responsibility concepts outside the RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.delete_career_profile_data() $$,
  'full profile deletion advances its tombstone and removes structured data'
);
select is(
  (
    select generation
    from public.career_profile_generations
    where user_id = '90000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the durable generation tombstone survives profile deletion'
);
select throws_ok(
  $$ select public.save_career_profile_draft(
    0,
    '{"cvDocumentId":null,"currentSeniority":"senior","targetSeniority":"lead","targetRoleFamilies":[{"normalizedConcept":"stale role","label":"Stale role"}],"industries":[],"domains":[],"keywords":[],"evidence":[]}'::jsonb
  ) $$,
  '40001',
  'stale career profile snapshot',
  'a replayed stale profile save cannot recreate deleted personal data'
);
select throws_ok(
  $$ select public.save_search_profile(
    null,
    0,
    '{"name":"Stale search","enabled":true,"roleFamilies":[{"normalizedConcept":"stale role","label":"Stale role"}],"includeTerms":[],"excludeTerms":[],"industries":[],"domains":[],"skillConcepts":[],"responsibilityConcepts":[],"currentSeniority":"senior","targetSeniority":"lead","employmentTypes":[],"workingTimes":[],"workplaceTypes":[],"ukLocations":[],"ir35Statuses":[],"compensation":{"minimum":null,"maximum":null,"period":"unknown","allowUnknown":true},"recencyDays":14,"notificationsEnabled":false}'::jsonb
  ) $$,
  '40001',
  'stale career profile snapshot',
  'a replayed stale search save cannot recreate deleted profile data'
);
select lives_ok(
  $$ select public.save_career_profile_draft(
    1,
    '{"cvDocumentId":null,"currentSeniority":"senior","targetSeniority":"lead","targetRoleFamilies":[{"normalizedConcept":"fresh role","label":"Fresh role"}],"industries":[],"domains":[],"keywords":[],"evidence":[]}'::jsonb
  ) $$,
  'a deliberate save from the fresh empty snapshot can start again'
);
select is(
  (
    select (public.get_career_profile_snapshot() ->> 'generation')::bigint
  ),
  1::bigint,
  'the atomic snapshot returns the current durable generation'
);

select * from finish();
rollback;

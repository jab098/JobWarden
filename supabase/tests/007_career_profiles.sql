begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

select has_table('public', 'career_profiles', 'career profiles are persisted');
select has_table(
  'public', 'career_profile_generations',
  'durable profile generation tombstones are persisted'
);
select has_table('public', 'career_evidence_items', 'career evidence is persisted');
select has_table('public', 'profile_suggestions', 'profile suggestions are persisted');
select has_table('public', 'search_profiles', 'named searches are persisted');
select has_table('public', 'cv_documents', 'CV metadata is persisted');
select has_table('public', 'cv_extraction_runs', 'CV extraction runs are persisted');
select has_table(
  'public', 'career_cv_upload_intents',
  'generation-bound CV upload intents are persisted'
);
select has_function(
  'public', 'begin_career_cv_upload', array['bigint', 'text'],
  'owners must reserve a generation-bound CV upload intent'
);
select has_function(
  'public', 'career_cv_upload_intent_allows', array['text'],
  'the Storage policy has a generation-locking intent guard'
);
select has_function(
  'public', 'lock_career_profile_generation', array['uuid'],
  'direct evidence deletion has an owner-derived generation mutex'
);
select has_column(
  'private', 'app_settings', 'career_cv_uploads_enabled',
  'real CV upload has a database-owned activation gate'
);
select is(
  (
    select career_cv_uploads_enabled
    from private.app_settings
    where singleton = true
  ),
  false,
  'real CV upload is disabled by default'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'career_profiles', 'career_profile_generations',
        'career_evidence_items', 'profile_suggestions', 'search_profiles',
        'cv_documents', 'cv_extraction_runs', 'career_cv_upload_intents'
      )
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  8,
  'every career-data table enables and forces RLS'
);

select is(
  (select public from storage.buckets where id = 'career-documents'),
  false,
  'the career-document bucket is private'
);
select is(
  (select file_size_limit::integer from storage.buckets where id = 'career-documents'),
  5242880,
  'the career-document bucket is capped at 5 MiB'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.register_cv_document(bigint,text,text,text,text,integer,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot register CV metadata'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.decide_profile_suggestion(uuid,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot decide profile suggestions'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_suggestions', 'UPDATE'),
  'authenticated callers cannot directly rewrite machine suggestions'
);
select ok(
  not has_table_privilege('authenticated', 'public.cv_documents', 'INSERT'),
  'authenticated callers register CV metadata through the atomic function'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_profiles', 'DELETE'),
  'full profile deletion cannot bypass Storage-first cleanup'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.career_profiles', 'UPDATE'),
  'authenticated callers cannot bypass the generation-fenced profile RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.search_profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.search_profiles', 'UPDATE'),
  'authenticated callers cannot bypass the evidence-bound named-search RPC'
);
select ok(
  not has_column_privilege(
    'authenticated', 'public.career_evidence_items', 'confirmation_state', 'UPDATE'
  ),
  'authenticated callers cannot directly update evidence confirmation state'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'UPDATE'
      and coalesce(qual, '') like '%career-documents%'
  ),
  0,
  'the immutable owner path has no Storage UPDATE policy'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.career_evidence_items', 'proficiency_signal', 'UPDATE'
  ),
  'authenticated owners retain the narrow non-decision evidence edit grant'
);

update private.app_settings
set career_cv_uploads_enabled = true
where singleton = true;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Profile owner"}', now(), now()),
  ('70000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-other@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Other approved user"}', now(), now()),
  ('70000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Profile administrator"}', now(), now()),
  ('70000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-pending@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Pending profile user"}', now(), now());

update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
where user_id in (
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002'
);

insert into public.user_roles (user_id, role, created_by)
values (
  '70000000-0000-4000-8000-000000000003',
  'admin',
  '70000000-0000-4000-8000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$ insert into public.career_profiles (user_id) values ('70000000-0000-4000-8000-000000000004') $$,
  '42501',
  null,
  'pending users cannot create a career profile'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$
    select public.save_career_profile_draft(
      0,
      '{
        "cvDocumentId":null,
        "currentSeniority":"senior",
        "targetSeniority":"lead",
        "targetRoleFamilies":[{
          "normalizedConcept":"analytics implementation",
          "label":"Analytics implementation"
        }],
        "industries":[],
        "domains":[],
        "keywords":[],
        "evidence":[]
      }'::jsonb
    )
  $$,
  'an approved owner can create their career profile through the fenced RPC'
);

select lives_ok(
  $$
    insert into public.career_evidence_items (
      id, user_id, normalized_concept, label, category, origin, confidence,
      proficiency_signal, confirmation_state
    ) values (
      '71000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      'analytics implementation', 'Analytics implementation', 'responsibility',
      'user', 1, 'advanced', 'confirmed'
    )
  $$,
  'an approved owner can add confirmed user evidence'
);

select throws_ok(
  $$
    insert into public.search_profiles (
      id, user_id, name, role_families, target_seniority,
      employment_types, working_times, workplace_types, ir35_statuses
    ) values (
      '72000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      'Implementation roles',
      '[{"normalizedConcept":"analytics implementation","label":"Analytics implementation"}]'::jsonb,
      'lead', array['contract'], array['full_time'], array['hybrid'],
      array['outside', 'unknown']
    )
  $$,
  '42501',
  null,
  'an approved owner cannot create a named search outside the evidence-bound RPC'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.career_profiles), 0, 'another approved user cannot read the owner profile');
select is((select count(*)::integer from public.career_evidence_items), 0, 'another approved user cannot read owner evidence');
select is((select count(*)::integer from public.search_profiles), 0, 'another approved user cannot read owner searches');
select lives_ok(
  $$ select public.begin_career_cv_upload(
    0, '70000000-0000-4000-8000-000000000002/stale.pdf'
  ) $$,
  'an approved owner can reserve an upload against generation zero'
);
reset role;
set local role service_role;
update public.career_profile_generations
set generation = generation + 1
where user_id = '70000000-0000-4000-8000-000000000002';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values (
    'career-documents',
    '70000000-0000-4000-8000-000000000002/stale.pdf'
  ) $$,
  '42501',
  null,
  'a queued Storage insert cannot use an intent from a deleted generation'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', true);
select is(
  (select count(*)::integer from public.career_profiles),
  0,
  'administrator status alone does not reveal another user career profile'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.begin_career_cv_upload(
    0, '70000000-0000-4000-8000-000000000001/first.docx'
  ) $$,
  'the owner can reserve the first upload against the current generation'
);
insert into storage.objects (bucket_id, name)
values (
  'career-documents',
  '70000000-0000-4000-8000-000000000001/first.docx'
);
create temporary table first_cv as
select public.register_cv_document(
  0,
  '70000000-0000-4000-8000-000000000001/first.docx',
  'first.docx',
  'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  4096,
  repeat('a', 64)
) as id;

select ok((select id is not null from first_cv), 'the owner can register a current CV');

select lives_ok(
  $$ select public.begin_career_cv_upload(
    0, '70000000-0000-4000-8000-000000000001/second.pdf'
  ) $$,
  'the owner can reserve a replacement upload against the current generation'
);
insert into storage.objects (bucket_id, name)
values (
  'career-documents',
  '70000000-0000-4000-8000-000000000001/second.pdf'
);
create temporary table second_cv as
select public.register_cv_document(
  0,
  '70000000-0000-4000-8000-000000000001/second.pdf',
  'second.pdf',
  'pdf',
  'application/pdf',
  8192,
  repeat('b', 64)
) as id;

select ok((select id is not null from second_cv), 'the owner can replace the current CV');
select is(
  (select count(*)::integer from public.cv_documents where is_current),
  1,
  'CV replacement leaves exactly one current document'
);
select ok(
  (select replaced_at is not null from public.cv_documents where id = (select id from first_cv)),
  'CV replacement timestamps the previous document'
);

select throws_ok(
  format(
    $sql$
      insert into public.career_evidence_items (
        user_id, cv_document_id, normalized_concept, label, category, origin,
        confidence, evidence_reference, proficiency_signal, confirmation_state
      ) values (
        '70000000-0000-4000-8000-000000000001', %L,
        'forged cv evidence', 'Forged CV evidence', 'skill', 'cv', 1,
        'paragraph:1', 'advanced', 'confirmed'
      )
    $sql$,
    (select id from second_cv)
  ),
  '42501',
  null,
  'authenticated users cannot forge CV-derived evidence'
);

select throws_ok(
  $$
    update public.career_evidence_items
    set normalized_concept = 'rewritten evidence'
    where id = '71000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'authenticated users cannot rewrite extracted evidence fields'
);

reset role;
set local role service_role;

select lives_ok(
  format(
    $sql$
      insert into public.career_evidence_items (
        id, user_id, cv_document_id, normalized_concept, label, category,
        origin, confidence, evidence_reference, evidence_excerpt,
        proficiency_signal, confirmation_state
      ) values (
        '71000000-0000-4000-8000-000000000002',
        '70000000-0000-4000-8000-000000000001', %L,
        'implementation consulting', 'Implementation consulting',
        'responsibility', 'cv', 0.92, 'paragraph:14',
        'Delivered governed implementations.', 'advanced', 'proposed'
      )
    $sql$,
    (select id from second_cv)
  ),
  'the service role can persist CV-derived proposed evidence'
);

select lives_ok(
  format(
    $sql$
      insert into public.cv_extraction_runs (
        id, user_id, cv_document_id, status, extractor_version,
        idempotency_key, proposal, evidence_count, suggestion_count,
        input_character_count, completed_at, proposal_expires_at
      ) values (
        '73000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000001',
        %L, 'succeeded', 'deterministic-v1', 'profile-owner-run-1',
        '{"version":"deterministic-v1"}'::jsonb, 1, 1, 1200, now(),
        now() + interval '24 hours'
      )
    $sql$,
    (select id from second_cv)
  ),
  'the service role can persist a bounded successful extraction proposal'
);

select lives_ok(
  $$
    insert into public.profile_suggestions (
      id, user_id, extraction_run_id, kind, normalized_concept, label,
      confidence, evidence_item_ids
    ) values (
      '74000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001',
      'role_family', 'analytics solutions consulting',
      'Analytics solutions consulting', 0.86,
      array['71000000-0000-4000-8000-000000000002'::uuid]
    )
  $$,
  'the service role can persist an inactive evidence-backed suggestion'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);

select is((select count(*)::integer from public.cv_extraction_runs), 1, 'the owner can read their extraction run');
select is((select count(*)::integer from public.profile_suggestions), 1, 'the owner can read their proposed suggestion');
select is(
  public.decide_profile_suggestion(
    '74000000-0000-4000-8000-000000000001',
    'accepted'
  ),
  'accepted',
  'the owner can explicitly accept a proposed suggestion'
);
select is(
  (select state from public.profile_suggestions where id = '74000000-0000-4000-8000-000000000001'),
  'accepted',
  'accepted suggestion state is persisted'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.decide_profile_suggestion('74000000-0000-4000-8000-000000000001', 'rejected') $$,
  'P0002',
  'profile suggestion not found',
  'another approved user cannot decide the owner suggestion'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ select public.delete_career_profile_data() $$,
  'the owner can delete their career profile through the reviewed RPC'
);
select is(
  (
    (select count(*) from public.career_profiles)
    + (select count(*) from public.career_evidence_items)
    + (select count(*) from public.profile_suggestions)
    + (select count(*) from public.search_profiles)
    + (select count(*) from public.cv_documents)
    + (select count(*) from public.cv_extraction_runs)
  )::integer,
  0,
  'profile deletion cascades through every owner metadata table'
);

select * from finish();
rollback;

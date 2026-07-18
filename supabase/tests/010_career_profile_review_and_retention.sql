begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_column(
  'public', 'cv_extraction_runs', 'proposal_expires_at',
  'successful raw proposals have an expiry timestamp'
);
select has_column(
  'public', 'cv_extraction_runs', 'proposal_expired_at',
  'expired raw proposals retain a bounded cleanup timestamp'
);
select has_function(
  'public', 'decide_career_evidence', array['uuid', 'text'],
  'owner-derived evidence review exists'
);
select has_function(
  'public', 'purge_inactive_cv_document', array['uuid', 'text'],
  'storage-first inactive CV metadata cleanup exists'
);
select has_function(
  'public', 'expire_career_profile_proposals', array[]::text[],
  'raw proposal expiry exists'
);
select has_trigger(
  'public', 'cv_extraction_runs', 'restore_cv_after_failed_extraction',
  'all failed extraction finalisation restores a usable prior CV'
);
select ok(
  not has_function_privilege(
    'anon', 'public.decide_career_evidence(uuid,text)', 'EXECUTE'
  ),
  'anonymous callers cannot review career evidence'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.decide_career_evidence(uuid,text)', 'EXECUTE'
  ),
  'authenticated approved owners can review their evidence'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.purge_inactive_cv_document(uuid,text)', 'EXECUTE'
  ),
  'authenticated callers cannot purge inactive CV metadata directly'
);
select ok(
  has_function_privilege(
    'service_role', 'public.purge_inactive_cv_document(uuid,text)', 'EXECUTE'
  ),
  'the service cleanup path can purge inactive CV metadata after Storage'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.expire_career_profile_proposals()', 'EXECUTE'
  ),
  'authenticated callers cannot run global proposal expiry'
);
select ok(
  has_function_privilege(
    'service_role', 'public.expire_career_profile_proposals()', 'EXECUTE'
  ),
  'the service retention path can expire raw proposals'
);
select throws_ok(
  $$ select public.decide_career_evidence(
    '00000000-0000-4000-8000-000000000001'::uuid,
    'confirmed'
  ) $$,
  '42501',
  null,
  'evidence review requires an authenticated approved actor'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '80000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'retention-owner@example.test', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Retention owner"}', now(), now()
);
insert into public.career_profiles (user_id)
values ('80000000-0000-4000-8000-000000000001');
insert into public.cv_documents (
  id, user_id, storage_path, original_file_name, file_kind, media_type,
  byte_size, sha256, lifecycle_status, is_current, replaced_at
)
values
  (
    '82000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001/previous.docx',
    'previous.docx', 'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    100, repeat('a', 64), 'ready', false, now()
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001/replacement.pdf',
    'replacement.pdf', 'pdf', 'application/pdf',
    100, repeat('b', 64), 'processing', true, null
  );
insert into public.cv_extraction_runs (
  id, user_id, cv_document_id, status, extractor_version, idempotency_key,
  started_at
)
values (
  '83000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000002',
  'running', 'deterministic-v1', repeat('c', 64), now()
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.complete_career_profile_extraction(
    '83000000-0000-4000-8000-000000000001',
    'failed', null, 'internal_error', 0, 0, 0
  ) $$,
  'a failed replacement completes with a sanitised result'
);
select is(
  (
    select id
    from public.cv_documents
    where user_id = '80000000-0000-4000-8000-000000000001' and is_current
  ),
  '82000000-0000-4000-8000-000000000001'::uuid,
  'a failed replacement restores the prior usable CV'
);
select is(
  (
    select lifecycle_status || ':' || is_current::text
    from public.cv_documents
    where id = '82000000-0000-4000-8000-000000000002'
  ),
  'failed:false',
  'the failed replacement becomes an inactive cleanup candidate'
);

reset role;
update public.cv_documents
set is_current = false, replaced_at = now()
where id = '82000000-0000-4000-8000-000000000001';
insert into public.career_evidence_items (
  id, user_id, normalized_concept, label, category, origin, confidence,
  proficiency_signal, confirmation_state
)
values (
  '81100000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'sql', 'SQL', 'tool', 'user', 1, 'working', 'confirmed'
);
insert into public.cv_documents (
  id, user_id, storage_path, original_file_name, file_kind, media_type,
  byte_size, sha256, lifecycle_status, is_current
)
values (
  '82000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001/success.docx',
  'success.docx', 'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  100, repeat('d', 64), 'processing', true
);
insert into public.cv_extraction_runs (
  id, user_id, cv_document_id, status, extractor_version, idempotency_key,
  started_at
)
values (
  '83000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000003',
  'running', 'deterministic-v1', repeat('e', 64), now()
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.complete_career_profile_extraction(
    '83000000-0000-4000-8000-000000000002',
    'succeeded',
    '{
      "version":"deterministic-v1",
      "inputCharacterCount":17,
      "evidence":[{
        "id":"81000000-0000-4000-8000-000000000001",
        "normalizedConcept":"sql",
        "label":"SQL",
        "category":"tool",
        "confidence":0.99,
        "evidenceReference":"character:0-3",
        "evidenceExcerpt":"Used SQL.",
        "matchedText":"SQL",
        "proficiencySignal":"demonstrated",
        "confirmationState":"proposed"
      },{
        "id":"81000000-0000-4000-8000-000000000002",
        "normalizedConcept":"tableau",
        "label":"Tableau",
        "category":"tool",
        "confidence":0.99,
        "evidenceReference":"character:9-16",
        "evidenceExcerpt":"Used Tableau.",
        "matchedText":"Tableau",
        "proficiencySignal":"demonstrated",
        "confirmationState":"proposed"
      }],
      "suggestions":[],
      "aiSuggestions":[]
    }'::jsonb,
    null, 17, 2, 0
  ) $$,
  'successful completion materialises a bounded structured proposal'
);
select is(
  (
    select confirmation_state
    from public.career_evidence_items
    where id = '81000000-0000-4000-8000-000000000002'
  ),
  'proposed',
  'extracted evidence remains inactive until owner review'
);
select is(
  (
    select origin || ':' || confirmation_state
    from public.career_evidence_items
    where id = '81100000-0000-4000-8000-000000000001'
  ),
  'user:confirmed',
  'CV extraction cannot overwrite explicit user-confirmed evidence'
);
select ok(
  (
    select proposal_expires_at > completed_at
    from public.cv_extraction_runs
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  'successful raw proposals receive a future expiry'
);
update public.cv_extraction_runs
set proposal_expires_at = clock_timestamp() - interval '1 second'
where id = '83000000-0000-4000-8000-000000000002';
select is(
  public.expire_career_profile_proposals(),
  1,
  'the retention operation expires one overdue raw proposal'
);
select is(
  (
    select proposal is null
    from public.cv_extraction_runs
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  true,
  'expired raw proposal content is removed'
);
select is(
  (
    select count(*)::integer
    from public.career_evidence_items
    where id = '81000000-0000-4000-8000-000000000002'
  ),
  1,
  'separately materialised review evidence survives raw proposal expiry'
);

reset role;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '80000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'allowance-owner@example.test', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Allowance owner"}', now(), now()
);
update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
where user_id in (
  '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002'
);
insert into public.career_profiles (user_id)
values ('80000000-0000-4000-8000-000000000002');
insert into public.cv_documents (
  id, user_id, storage_path, original_file_name, file_kind, media_type,
  byte_size, sha256, lifecycle_status, is_current
)
values (
  '82000000-0000-4000-8000-000000000004',
  '80000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000002/allowance.pdf',
  'allowance.pdf', 'pdf', 'application/pdf',
  100, repeat('f', 64), 'ready', true
);
update private.app_settings
set career_cv_uploads_enabled = true
where singleton = true;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000001',
  true
);
select is(
  (
    select ai_allowed
    from public.claim_career_profile_extraction(
      '82000000-0000-4000-8000-000000000003', repeat('1', 64), 1
    )
  ),
  true,
  'the first daily AI reservation is admitted'
);
select set_config(
  'request.jwt.claim.sub',
  '80000000-0000-4000-8000-000000000002',
  true
);
select is(
  (
    select ai_allowed
    from public.claim_career_profile_extraction(
      '82000000-0000-4000-8000-000000000004', repeat('2', 64), 1
    )
  ),
  false,
  'the application-wide daily ceiling denies a second user atomically'
);

select * from finish();
rollback;

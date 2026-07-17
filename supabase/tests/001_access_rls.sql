begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Pending user"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approved@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Approved user"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suspended@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Suspended user"}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'administrator@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Administrator"}', now(), now());

update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
where user_id = '10000000-0000-4000-8000-000000000002';

update public.access_requests
set status = 'suspended', decided_at = now(), decision_reason = 'Suspended fixture'
where user_id = '10000000-0000-4000-8000-000000000003';

insert into public.user_roles (user_id, role, created_by)
values (
  '10000000-0000-4000-8000-000000000004',
  'admin',
  '10000000-0000-4000-8000-000000000004'
);

insert into public.job_sources (
  id,
  provider,
  board_token,
  employer_name,
  allowed_hosts,
  terms_reviewed_at,
  robots_reviewed_at,
  compliance_notes
)
values (
  '11000000-0000-4000-8000-000000000001',
  'greenhouse',
  'access-test-board',
  'Access Test Ltd',
  array['boards.greenhouse.io'],
  current_date,
  current_date,
  'Public Greenhouse Job Board API fixture.'
);

insert into public.ingestion_runs (id, trigger_type, status, started_at)
values ('12000000-0000-4000-8000-000000000001', 'scheduled', 'running', now());

insert into public.ingestion_source_runs (id, run_id, source_id, status, started_at)
values (
  '13000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'running',
  now()
);

insert into public.jobs (
  source_id,
  provider_job_id,
  title,
  employer,
  description_text,
  application_url,
  country_code,
  uk_eligibility_evidence,
  employment_type,
  working_time,
  workplace_type,
  ir35_status,
  compensation_period,
  content_hash,
  lifecycle_status
)
values (
  '11000000-0000-4000-8000-000000000001',
  'access-visible-job',
  'Platform Engineer',
  'Access Test Ltd',
  'A UK role.',
  'https://boards.greenhouse.io/access/jobs/1',
  'GB',
  array['Location: England'],
  'permanent',
  'full_time',
  'hybrid',
  'not_applicable',
  'unknown',
  repeat('a', 64),
  'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.jobs),
  0,
  'pending users select zero jobs'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is(
  (select count(*)::integer from public.jobs),
  0,
  'suspended users select zero jobs'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.decide_access_request('10000000-0000-4000-8000-000000000001', 'approved', 'Not allowed') $$,
  '42501',
  'administrator required',
  'approved non-administrators cannot decide access'
);

select throws_ok(
  $$ select public.set_access_requests_enabled(false) $$,
  '42501',
  'administrator required',
  'approved non-administrators cannot change private-beta settings'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null,
      'greenhouse',
      'forbidden-board',
      'Forbidden Ltd',
      true,
      60,
      current_date,
      current_date,
      'GET',
      'Should not be written.',
      array['boards.greenhouse.io']
    )
  $$,
  '42501',
  'administrator required',
  'approved non-administrators cannot mutate sources'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE'),
  'authenticated callers have no audit update privilege'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'),
  'authenticated callers have no audit delete privilege'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select cmp_ok(
  (select count(*)::integer from public.access_requests),
  '>=',
  4,
  'administrators can read all access requests'
);

select is(
  (select count(*)::integer from public.ingestion_runs),
  1,
  'administrators can read ingestion runs'
);

select is(
  (select count(*)::integer from public.ingestion_source_runs),
  1,
  'administrators can read per-source ingestion data'
);

select lives_ok(
  $$ select public.decide_access_request('10000000-0000-4000-8000-000000000001', 'approved', 'Verified private-beta member') $$,
  'administrators can decide access through the audited function'
);

select * from finish();
rollback;

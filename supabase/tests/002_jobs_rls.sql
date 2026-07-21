begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jobs-pending@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jobs-approved@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jobs-suspended@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jobs-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.access_requests set status = 'approved' where user_id = '20000000-0000-4000-8000-000000000002';
update public.access_requests set status = 'suspended' where user_id = '20000000-0000-4000-8000-000000000003';
insert into public.user_roles (user_id, role, created_by)
values ('20000000-0000-4000-8000-000000000004', 'admin', '20000000-0000-4000-8000-000000000004');

insert into public.job_sources (
  id, provider, board_token, employer_name, allowed_hosts,
  terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values (
  '21000000-0000-4000-8000-000000000001', 'greenhouse', 'jobs-test-board',
  'Jobs Test Ltd', array['boards.greenhouse.io'], current_date, current_date,
  'Public Greenhouse Job Board API fixture.'
);

insert into public.jobs (
  source_id, provider_job_id, title, employer, description_text,
  application_url, country_code, uk_eligibility_evidence, employment_type,
  working_time, workplace_type, ir35_status, compensation_period, content_hash,
  deduplication_key, lifecycle_status
)
select
  '21000000-0000-4000-8000-000000000001'::uuid,
  'jobs-rls-' || lifecycle_status,
  initcap(lifecycle_status) || ' role',
  'Jobs Test Ltd',
  'A UK role.',
  'https://boards.greenhouse.io/jobs-test/jobs/' || lifecycle_status,
  'GB',
  array['Location: Scotland'],
  'contract',
  'full_time',
  'remote',
  'outside',
  'day',
  -- Both columns are constrained to `^[a-f0-9]{64}$`, so neither can repeat an
  -- initial: 'quarantined' would repeat a 'q'. Doubled md5 is hex, distinct per
  -- lifecycle status, and distinct between the two columns.
  md5('hash-' || lifecycle_status) || md5('hash-' || lifecycle_status),
  md5(lifecycle_status) || md5(lifecycle_status),
  lifecycle_status
from unnest(array['active', 'closed', 'quarantined']) as lifecycle_status;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.jobs), 0, 'pending users see no jobs');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.jobs), 0, 'suspended users see no jobs');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select lifecycle_status from public.jobs order by lifecycle_status $$,
  $$ values ('active'::text) $$,
  'approved users see active jobs only'
);

select ok(not has_table_privilege('authenticated', 'public.jobs', 'INSERT'), 'approved users cannot insert jobs');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'UPDATE'), 'approved users cannot update jobs');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'DELETE'), 'approved users cannot delete jobs');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.jobs), 3, 'administrators see every job lifecycle state');

select * from finish();
rollback;

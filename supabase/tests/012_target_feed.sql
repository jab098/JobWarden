begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_table('public', 'career_job_decisions', 'career job decisions are persisted');
select has_function(
  'public', 'decide_career_job', array['uuid', 'text'],
  'the owner-fenced job decision RPC exists'
);
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'career_job_decisions'
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  1,
  'career job decisions enable and force RLS'
);
select ok(
  not has_function_privilege('anon', 'public.decide_career_job(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot decide career jobs'
);
select ok(
  has_function_privilege('authenticated', 'public.decide_career_job(uuid,text)', 'EXECUTE'),
  'authenticated owners can decide career jobs'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_job_decisions', 'INSERT'),
  'approved users cannot insert job decisions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_job_decisions', 'UPDATE'),
  'approved users cannot update job decisions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_job_decisions', 'DELETE'),
  'approved users cannot delete job decisions directly'
);

select throws_ok(
  $$ select public.decide_career_job(
    '00000000-0000-4000-8000-000000000001'::uuid, 'saved'
  ) $$,
  '42501',
  null,
  'job decisions require an authenticated approved actor'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '90000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'target-feed-owner-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Target feed owner A"}', now(), now()
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'target-feed-owner-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Target feed owner B"}', now(), now()
  );
update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
where user_id in (
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002'
);

insert into public.job_sources (
  id, provider, board_token, employer_name, allowed_hosts,
  terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values (
  '91000000-0000-4000-8000-000000000001', 'greenhouse', 'target-feed-board',
  'Target Feed Ltd', array['boards.greenhouse.io'], current_date, current_date,
  'Public Greenhouse Job Board API fixture.'
);
insert into public.jobs (
  id, source_id, provider_job_id, title, employer, description_text,
  application_url, country_code, uk_eligibility_evidence, employment_type,
  working_time, workplace_type, ir35_status, compensation_period, content_hash,
  deduplication_key, lifecycle_status
)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001', 'target-feed-job-1', 'Target Feed Role',
  'Target Feed Ltd', 'A UK role.',
  'https://boards.greenhouse.io/target-feed/jobs/1', 'GB',
  array['Location: Scotland'], 'permanent', 'full_time', 'remote', 'not_applicable',
  'year', repeat('1', 64), repeat('2', 64), 'active'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ select public.decide_career_job(
    '92000000-0000-4000-8000-000000000001'::uuid, 'unknown'
  ) $$,
  '22023',
  null,
  'an unrecognised decision value is rejected'
);
select throws_ok(
  $$ select public.decide_career_job(
    '93000000-0000-4000-8000-000000000099'::uuid, 'saved'
  ) $$,
  'P0002',
  null,
  'a nonexistent job cannot be decided'
);

select is(
  public.decide_career_job('92000000-0000-4000-8000-000000000001'::uuid, 'saved'),
  'saved',
  'an owner can save a job'
);
select is(
  (
    select decision from public.career_job_decisions
    where owner_id = '90000000-0000-4000-8000-000000000001'
      and job_id = '92000000-0000-4000-8000-000000000001'
  ),
  'saved',
  'the saved decision is persisted'
);
select is(
  public.decide_career_job('92000000-0000-4000-8000-000000000001'::uuid, 'considering'),
  'considering',
  'an owner can transition an existing decision'
);
select is(
  (
    select count(*)::integer from public.career_job_decisions
    where owner_id = '90000000-0000-4000-8000-000000000001'
      and job_id = '92000000-0000-4000-8000-000000000001'
  ),
  1,
  'transitioning a decision upserts rather than duplicating the row'
);
select is(
  public.decide_career_job('92000000-0000-4000-8000-000000000001'::uuid, 'clear'),
  null,
  'clearing a decision returns no decision'
);
select is(
  (
    select count(*)::integer from public.career_job_decisions
    where owner_id = '90000000-0000-4000-8000-000000000001'
      and job_id = '92000000-0000-4000-8000-000000000001'
  ),
  0,
  'clearing a decision deletes the row'
);

select public.decide_career_job('92000000-0000-4000-8000-000000000001'::uuid, 'dismissed');
select is(
  (select count(*)::integer from public.career_job_decisions),
  1,
  'exactly one decision row exists before the isolation check'
);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.career_job_decisions),
  0,
  'another owner cannot see a different owner''s job decisions'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (select count(*)::integer from public.career_job_decisions
    where owner_id = '90000000-0000-4000-8000-000000000001'),
  1,
  'the owner''s dismissed decision is visible to the service role before deletion'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select public.delete_career_profile_data();
select is(
  (select count(*)::integer from public.career_job_decisions
    where owner_id = '90000000-0000-4000-8000-000000000001'),
  0,
  'full career profile deletion also erases the owner''s job decisions'
);

select * from finish();
rollback;

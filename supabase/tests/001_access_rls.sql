begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

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
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'administrator@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Administrator"}', now(), now()),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bootstrap@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bootstrap target"}', now(), now()),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rollback@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rollback target"}', now(), now());

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
  deduplication_key,
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
  repeat('b', 64),
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
  $$ select public.get_access_requests_enabled() $$,
  '42501',
  'administrator required',
  'approved non-administrators cannot read private app settings'
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
select is(
  public.get_access_requests_enabled(),
  true,
  'administrators can read the private access-request setting through a narrow getter'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null,
      'greenhouse',
      'null-host-board',
      'Null Host Ltd',
      true,
      60,
      current_date,
      current_date,
      'GET',
      'Must reject a null host entry.',
      array['boards.greenhouse.io', null]
    )
  $$,
  '22023',
  'invalid allowed host',
  'source mutation rejects NULL allowed-host entries'
);

select ok(
  not has_function_privilege('authenticated', 'public.bootstrap_admin(uuid)', 'EXECUTE'),
  'authenticated callers cannot execute administrator bootstrap'
);

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

reset role;
set local role service_role;

select lives_ok(
  $$ select public.bootstrap_admin('10000000-0000-4000-8000-000000000005') $$,
  'service role can bootstrap an exact verified identity atomically'
);

select lives_ok(
  $$ select public.bootstrap_admin('10000000-0000-4000-8000-000000000005') $$,
  'administrator bootstrap is idempotent on rerun'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = '10000000-0000-4000-8000-000000000005'
      and role = 'admin'
  ),
  1,
  'idempotent bootstrap stores one administrator role'
);

select is(
  (
    select count(*)::integer
    from public.audit_log
    where action = 'admin.bootstrap'
      and resource_id = '10000000-0000-4000-8000-000000000005'
  ),
  2,
  'each successful bootstrap execution records an audit event'
);

create function private.reject_bootstrap_audit_test()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'admin.bootstrap'
    and new.resource_id = '10000000-0000-4000-8000-000000000006' then
    raise exception 'forced bootstrap audit failure';
  end if;
  return new;
end;
$$;

create trigger reject_bootstrap_audit_for_rollback_test
before insert on public.audit_log
for each row execute function private.reject_bootstrap_audit_test();

set local role service_role;
select throws_ok(
  $$ select public.bootstrap_admin('10000000-0000-4000-8000-000000000006') $$,
  'P0001',
  'forced bootstrap audit failure',
  'an audit failure aborts administrator bootstrap'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = '10000000-0000-4000-8000-000000000006'
      and role = 'admin'
  ),
  0,
  'audit failure rolls back the administrator role write'
);

-- The bootstrap deadlock, found by an owner following the runbook for the
-- first time. `bootstrap_admin` granted the role and left `access_requests`
-- at `pending`, so the first administrator was refused by every product
-- surface — including `/admin/access`, the only screen that could have
-- approved them. There was no way out through the product.
select is(
  (
    select status
    from public.access_requests
    where user_id = '10000000-0000-4000-8000-000000000005'
  ),
  'approved',
  'bootstrapping an administrator also approves their own access request'
);

select is(
  (
    select count(*)::integer
    from public.audit_log
    where resource_id = '10000000-0000-4000-8000-000000000005'
      and action = 'access.decided'
      and metadata ->> 'method' = 'admin_bootstrap'
  ),
  1,
  'the self-approval is audited exactly once, even across a rerun'
);

-- The two axes stay separate, and the approval reaches exactly one row. It is
-- granted from `pending` only, so a suspended account is never quietly
-- reinstated, and no other waiting user is swept up with it.
select is(
  (
    select status
    from public.access_requests
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  'suspended',
  'bootstrapping an administrator does not reinstate a suspended account'
);

select is(
  (
    select status
    from public.access_requests
    where user_id = '10000000-0000-4000-8000-000000000006'
  ),
  'pending',
  'bootstrapping an administrator leaves other pending users pending'
);

select * from finish();
rollback;

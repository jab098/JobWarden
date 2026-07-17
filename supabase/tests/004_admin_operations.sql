begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'queue-user@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Queue user"}', now(), now()),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated', 'queue-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Queue administrator"}', now(), now());

update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Approved fixture'
where user_id = '40000000-0000-4000-8000-000000000001';

insert into public.user_roles (user_id, role, created_by)
values (
  '40000000-0000-4000-8000-000000000002',
  'admin',
  '40000000-0000-4000-8000-000000000002'
);

insert into public.job_sources (
  id, provider, board_token, employer_name, enabled, minimum_sync_interval,
  allowed_hosts, terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values
  ('41000000-0000-4000-8000-000000000001', 'greenhouse', 'queue-source', 'Queue Source Ltd', true, interval '60 minutes', array['boards.greenhouse.io'], current_date, current_date, 'Public Greenhouse fixture.'),
  ('41000000-0000-4000-8000-000000000002', 'greenhouse', 'disabled-source', 'Disabled Source Ltd', false, interval '60 minutes', array['boards.greenhouse.io'], current_date, current_date, 'Disabled public fixture.');

select ok(
  not has_function_privilege('anon', 'public.request_source_ingestion(uuid)', 'EXECUTE'),
  'anonymous callers cannot execute the ingestion-request function'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ select public.request_source_ingestion('41000000-0000-4000-8000-000000000001') $$,
  '42501',
  'administrator required',
  'approved non-administrators cannot request ingestion'
);

select is(
  (select count(*)::integer from public.ingestion_requests),
  0,
  'approved non-administrators select zero ingestion requests'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'greenhouse', 'too-fast-source', 'Too Fast Ltd', true, 14,
      current_date, current_date, 'GET', 'Must reject short interval.',
      array['boards.greenhouse.io']
    )
  $$,
  '22023',
  'invalid minimum sync interval',
  'the administrator source RPC rejects fourteen minutes'
);

select lives_ok(
  $$
    select public.upsert_job_source(
      null, 'greenhouse', 'fifteen-minute-source', 'Fifteen Minute Ltd', true, 15,
      current_date, current_date, 'GET', 'The minimum valid interval.',
      array['boards.greenhouse.io']
    )
  $$,
  'the administrator source RPC accepts fifteen minutes'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'greenhouse', 'duplicate-host-source', 'Duplicate Host Ltd', true, 60,
      current_date, current_date, 'GET', 'Must reject duplicate hosts.',
      array['boards.greenhouse.io', 'boards.greenhouse.io']
    )
  $$,
  '22023',
  'invalid allowed host',
  'the administrator source RPC rejects duplicate hosts'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'greenhouse', 'future-review-source', 'Future Review Ltd', true, 60,
      current_date + 1, current_date, 'GET', 'Must reject future review dates.',
      array['boards.greenhouse.io']
    )
  $$,
  '22023',
  'source review dates required',
  'the administrator source RPC rejects future review dates'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, minimum_sync_interval,
      allowed_hosts, terms_reviewed_at, robots_reviewed_at, compliance_notes
    ) values (
      'greenhouse', 'constraint-source', 'Constraint Source Ltd', interval '14 minutes',
      array['boards.greenhouse.io'], current_date, current_date, 'Constraint fixture.'
    )
  $$,
  '23514',
  null,
  'the table constraint rejects intervals below fifteen minutes'
);

select throws_ok(
  $$ select public.request_source_ingestion('41000000-0000-4000-8000-000000000099') $$,
  'P0002',
  'job source not found',
  'missing sources cannot be queued'
);

select throws_ok(
  $$ select public.request_source_ingestion('41000000-0000-4000-8000-000000000002') $$,
  '22023',
  'job source is disabled',
  'disabled sources cannot be queued'
);

create temporary table first_request as
select * from public.request_source_ingestion('41000000-0000-4000-8000-000000000001');

select is(
  (select request_state from first_request),
  'queued',
  'the first eligible request is queued'
);

create temporary table second_request as
select * from public.request_source_ingestion('41000000-0000-4000-8000-000000000001');

select is(
  (select request_state from second_request),
  'coalesced',
  'a second active request is coalesced'
);

select is(
  (select request_id from second_request),
  (select request_id from first_request),
  'a coalesced request returns the existing request ID'
);

select is(
  (select correlation_id from second_request),
  (select correlation_id from first_request),
  'a coalesced request returns the existing correlation ID'
);

select is(
  (
    select count(*)::integer
    from public.audit_log
    where action = 'ingestion.requested'
      and resource_id = (select request_id::text from first_request)
  ),
  1,
  'coalescing does not create a second audit event'
);

select is(
  (select count(*)::integer from public.ingestion_requests),
  1,
  'administrators can read the one active request'
);

reset role;

update public.ingestion_requests
set status = 'completed', completed_at = now(), updated_at = now()
where id = (select request_id from first_request);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$ select public.request_source_ingestion('41000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'source cooldown active',
  'a completed request still enforces the source cooldown'
);

reset role;

update public.ingestion_requests
set requested_at = now() - interval '61 minutes'
where id = (select request_id from first_request);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);

create temporary table third_request as
select * from public.request_source_ingestion('41000000-0000-4000-8000-000000000001');

select is(
  (select request_state from third_request),
  'queued',
  'a new request is queued after the interval elapses'
);

select isnt(
  (select request_id from third_request),
  (select request_id from first_request),
  'a later eligible request receives a new ID'
);

select is(
  (
    select count(*)::integer
    from public.audit_log
    where action = 'ingestion.requested'
  ),
  2,
  'each new queued request creates one audit event'
);

select * from finish();
rollback;

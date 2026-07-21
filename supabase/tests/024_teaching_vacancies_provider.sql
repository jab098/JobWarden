begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Task 38. Teaching Vacancies is a single national discovery source read under
-- Open Government Licence v3.0, not one row per employer. Its identity is
-- pinned at the constraint exactly as Reed's is, and like Reed it stays outside
-- the administrator source form.

select lives_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'teaching_vacancies', 'gb-discovery', 'Teaching Vacancies', false,
      interval '6 hours', current_date, current_date,
      'DfE Teaching Vacancies API, Open Government Licence v3.',
      array['teaching-vacancies.service.gov.uk'], 'incremental'
    )
  $$,
  'the reviewed Teaching Vacancies discovery source inserts'
);

-- Incremental is not a convention here. A bounded read of a paginated service
-- is not a snapshot, and a complete-coverage source may close jobs by omission.
select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'teaching_vacancies', 'gb-discovery', 'Teaching Vacancies', false,
      interval '6 hours', current_date, current_date,
      'Complete coverage would let a partial read close jobs.',
      array['teaching-vacancies.service.gov.uk'], 'complete'
    )
  $$,
  '23514',
  null,
  'Teaching Vacancies cannot declare complete coverage'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'teaching_vacancies', 'gb-discovery', 'Teaching Vacancies', false,
      interval '1 hour', current_date, current_date,
      'Politeness floor towards a free public service.',
      array['teaching-vacancies.service.gov.uk'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Teaching Vacancies cannot run more often than every six hours'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'teaching_vacancies', 'some-other-board', 'Teaching Vacancies', false,
      interval '6 hours', current_date, current_date,
      'Identity is pinned.',
      array['teaching-vacancies.service.gov.uk'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Teaching Vacancies is pinned to its gb-discovery board token'
);

-- The host pin is the one that matters most: it is what an adapter is allowed
-- to reach, so a row naming a different host must never exist.
select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'teaching_vacancies', 'gb-discovery', 'Teaching Vacancies', false,
      interval '6 hours', current_date, current_date,
      'A different host must not be reachable.',
      array['attacker.invalid'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Teaching Vacancies is pinned to its own host'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'teaching_vacancies', 'gb-discovery', 'Some Other Name', false,
      interval '6 hours', current_date, current_date,
      'Employer name is pinned.',
      array['teaching-vacancies.service.gov.uk'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Teaching Vacancies is pinned to its own employer name'
);

-- Reed regression guards. Its branch of the constraint was rewritten by this
-- task's migration, so its own pins are re-asserted.
select lives_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'reed', 'gb-discovery', 'Reed', false, interval '6 hours',
      current_date, current_date, 'Reed is unchanged by Task 38.',
      array['www.reed.co.uk'], 'incremental'
    )
  $$,
  'Reed still inserts unchanged'
);

select lives_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'lever', 'task-38-acme', 'Acme Ltd', false, interval '1 hour',
      current_date, current_date, 'Lever is unchanged by Task 38.',
      array['jobs.lever.co'], 'complete'
    )
  $$,
  'a Lever board still inserts unchanged'
);

-- Teaching Vacancies stays out of the administrator source form, exactly as
-- Reed does, because its identity is fixed rather than configured.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '65000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'task38-admin@example.test', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Task 38 administrator"}', now(), now()
);

insert into public.user_roles (user_id, role, created_by)
values (
  '65000000-0000-4000-8000-000000000001',
  'admin',
  '65000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"65000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'teaching_vacancies', 'gb-discovery', 'Teaching Vacancies', false,
      360, current_date, current_date, 'GET',
      'A national discovery source is not an administrator board.',
      array['teaching-vacancies.service.gov.uk']
    )
  $$,
  '22023',
  'unsupported source provider',
  'Teaching Vacancies stays outside the administrator source form'
);

reset role;

-- Privilege assertions on the functions this migration replaced.
select ok(
  not has_function_privilege('anon', 'public.claim_ingestion_requests(integer)', 'EXECUTE'),
  'anonymous callers still cannot claim ingestion requests'
);

select ok(
  not has_function_privilege('anon', 'public.upsert_ingested_jobs(uuid,jsonb)', 'EXECUTE'),
  'anonymous callers still cannot persist ingested jobs'
);

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- Task 30b. Lever joins the provider vocabulary as a per-employer
-- applicant-tracking board, coverage_mode 'complete' like Greenhouse. Its
-- adapter shipped in Task 30a but 'lever' was not a value the database would
-- accept, so the adapter could not be configured as a source.
--
-- Ashby joined in Task 31 alongside its adapter, and Workable is deliberately
-- still rejected. The vocabulary stays in lockstep with the adapters: the
-- database never accepts a provider the runtime cannot ingest, because a
-- source that can be configured but never run is a control that looks
-- configured and does nothing. Task 32 adds its own value alongside its
-- adapter, exactly as this one did.
--
-- Reed is unchanged, and every assertion about it here is a regression guard
-- on the constraint branch this task edited.
select lives_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'lever', 'acme', 'Acme Ltd', false, interval '1 hour',
      current_date, current_date, 'Lever public postings endpoint.',
      array['jobs.lever.co'], 'complete'
    )
  $$,
  'a Lever board is a supported complete-coverage source'
);

-- Task 31 flipped this. Ashby's adapter shipped in
-- `packages/ingestion/src/ashby.ts`, so the vocabulary accepts it — the
-- lockstep rule is satisfied by the adapter landing, not by the value waiting.
select lives_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'ashby', 'acme', 'Acme Ltd', false, interval '1 hour',
      current_date, current_date, 'Ashby public job posting API, Task 31.',
      array['jobs.ashbyhq.com'], 'complete'
    )
  $$,
  'an Ashby board is a supported complete-coverage source'
);

-- One documented request returns the whole board, so Ashby is complete like
-- Greenhouse and Lever. The mode is constrained at the boundary rather than by
-- convention, so an incremental Ashby source cannot be configured at all.
select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'ashby', 'acme-two', 'Acme Two Ltd', false, interval '1 hour',
      current_date, current_date, 'Ashby is a complete-coverage board.',
      array['jobs.ashbyhq.com'], 'incremental'
    )
  $$,
  '23514',
  null,
  'an Ashby board cannot be configured as incremental coverage'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'workable', 'acme', 'Acme Ltd', false, interval '1 hour',
      current_date, current_date, 'Workable has no adapter yet.',
      array['apply.workable.com'], 'complete'
    )
  $$,
  '23514',
  null,
  'Workable is rejected until its adapter ships in a later task'
);

-- Coverage mode is constrained at the database boundary, not by convention.
-- An ATS board claiming incremental coverage could never close a job by
-- omission, so the constraint has to reject it rather than trust the caller.
select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'lever', 'acme-incremental', 'Acme Ltd', false, interval '1 hour',
      current_date, current_date, 'Lever cannot be incremental.',
      array['jobs.lever.co'], 'incremental'
    )
  $$,
  '23514',
  null,
  'a Lever board cannot declare incremental coverage'
);

-- The vocabulary is a list, not an open field.
select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'indeed', 'acme', 'Acme Ltd', false, interval '1 hour',
      current_date, current_date, 'Indeed is not an allowlisted source.',
      array['uk.indeed.com'], 'complete'
    )
  $$,
  '23514',
  null,
  'an unlisted provider is still rejected'
);

-- Reed regression guards. The constraint branch carrying these was edited by
-- this task, so each pinned part of Reed's identity is re-asserted.
select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'reed', 'gb-discovery', 'Reed', false, interval '6 hours',
      current_date, current_date, 'Reed cannot be complete.',
      array['www.reed.co.uk'], 'complete'
    )
  $$,
  '23514',
  null,
  'Reed still cannot declare complete coverage'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'reed', 'other-token', 'Reed', false, interval '6 hours',
      current_date, current_date, 'Reed identity is pinned.',
      array['www.reed.co.uk'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Reed is still pinned to its gb-discovery board token'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'reed', 'gb-discovery', 'Reed', false, interval '1 hour',
      current_date, current_date, 'Reed cadence is still floored.',
      array['www.reed.co.uk'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Reed still cannot run more often than every six hours'
);

-- The six-hour floor is Reed-specific and must not have leaked onto the new
-- boards, which are allowed a shorter cadence.
select lives_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'lever', 'acme-fast', 'Acme Ltd', false, interval '30 minutes',
      current_date, current_date, 'Reed cadence floor is Reed-specific.',
      array['jobs.lever.co'], 'complete'
    )
  $$,
  'the Reed six-hour floor does not apply to a Lever board'
);

-- upsert_job_source: the administrator surface accepts Lever. Reed stays
-- excluded from it exactly as before, because Reed is a singleton discovery
-- source with a database-pinned identity rather than an
-- administrator-configurable employer board.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '64000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'vocabulary-admin@example.test', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Vocabulary administrator"}', now(), now()
);

insert into public.user_roles (user_id, role, created_by)
values (
  '64000000-0000-4000-8000-000000000001',
  'admin',
  '64000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$
    select public.upsert_job_source(
      null, 'lever', 'configured-acme', 'Configured Acme Ltd', false, 60,
      current_date, current_date, 'GET',
      'Lever board configured by an administrator.',
      array['jobs.lever.co']
    )
  $$,
  'an administrator can configure a Lever board'
);

-- Task 31 flipped this too. Ashby is a per-employer board, so unlike Reed and
-- Teaching Vacancies it is administrator configurable through the source form.
select lives_ok(
  $$
    select public.upsert_job_source(
      null, 'ashby', 'configured-acme', 'Configured Acme Ltd', false, 60,
      current_date, current_date, 'GET',
      'Ashby public job posting API, Task 31.',
      array['jobs.ashbyhq.com']
    )
  $$,
  'an administrator can configure an Ashby board'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'workable', 'configured-acme', 'Configured Acme Ltd', false, 60,
      current_date, current_date, 'GET',
      'Workable has no adapter yet.',
      array['apply.workable.com']
    )
  $$,
  '22023',
  'unsupported source provider',
  'an administrator cannot configure a Workable board before its adapter ships'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'indeed', 'configured-acme', 'Configured Acme Ltd', false, 60,
      current_date, current_date, 'GET',
      'Indeed is not an allowlisted source.',
      array['uk.indeed.com']
    )
  $$,
  '22023',
  'unsupported source provider',
  'an administrator still cannot configure an unlisted provider'
);

select throws_ok(
  $$
    select public.upsert_job_source(
      null, 'reed', 'gb-discovery', 'Reed', false, 360,
      current_date, current_date, 'GET',
      'Reed remains a pinned singleton, not an administrator board.',
      array['www.reed.co.uk']
    )
  $$,
  '22023',
  'unsupported source provider',
  'Reed remains outside the administrator source form, as before'
);

reset role;

-- Privilege assertions on every replaced function. This is the class that
-- Task 25c shipped broken because it never executed: a drop-and-create had
-- reset the ACL to EXECUTE for PUBLIC while the static verifier certified it
-- as revoked. Every function in this task is create-or-replace, which
-- preserves the ACL, and these assertions prove it rather than assume it.
select ok(
  not has_function_privilege('anon', 'public.upsert_job_source(uuid,text,text,text,boolean,integer,date,date,text,text,text[])', 'EXECUTE'),
  'anonymous callers cannot configure a job source'
);

select ok(
  not has_function_privilege('anon', 'public.start_source_ingestion(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot start a source ingestion run'
);

select ok(
  not has_function_privilege('anon', 'public.enqueue_scheduled_ingestion()', 'EXECUTE'),
  'anonymous callers cannot enqueue scheduled ingestion'
);

select ok(
  not has_function_privilege('anon', 'public.claim_ingestion_requests(integer)', 'EXECUTE'),
  'anonymous callers cannot claim ingestion requests'
);

select ok(
  not has_function_privilege('anon', 'public.upsert_ingested_jobs(uuid,jsonb)', 'EXECUTE'),
  'anonymous callers cannot persist ingested jobs'
);

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

select ok(
  not has_function_privilege('anon', 'public.enqueue_scheduled_ingestion()', 'EXECUTE'),
  'anonymous callers cannot enqueue scheduled ingestion'
);

select ok(
  not has_function_privilege('authenticated', 'public.claim_ingestion_requests(integer)', 'EXECUTE'),
  'authenticated callers cannot claim the ingestion queue'
);

select ok(
  has_function_privilege('service_role', 'public.enqueue_scheduled_ingestion()', 'EXECUTE'),
  'the service role can enqueue scheduled ingestion'
);

select ok(
  has_function_privilege('service_role', 'public.claim_ingestion_requests(integer)', 'EXECUTE'),
  'the service role can claim the ingestion queue'
);

select ok(
  has_function_privilege('service_role', 'public.complete_ingestion_request(uuid)', 'EXECUTE'),
  'the service role can complete an ingestion request'
);

select ok(
  not has_function_privilege('authenticated', 'public.upsert_ingested_jobs(uuid,jsonb)', 'EXECUTE'),
  'authenticated callers cannot persist an ingestion batch'
);

select ok(
  has_function_privilege('service_role', 'public.upsert_ingested_jobs(uuid,jsonb)', 'EXECUTE'),
  'the service role can persist a bounded ingestion batch'
);

insert into public.job_sources (
  id, provider, board_token, employer_name, enabled, minimum_sync_interval,
  allowed_hosts, terms_reviewed_at, robots_reviewed_at, compliance_notes,
  last_successful_sync_at
)
select
  ('51000000-0000-4000-8000-' || lpad(source_number::text, 12, '0'))::uuid,
  'greenhouse',
  'runtime-source-' || source_number,
  'Runtime Source ' || source_number || ' Ltd',
  true,
  interval '60 minutes',
  array['boards.greenhouse.io'],
  current_date,
  current_date,
  'Public Greenhouse runtime fixture.',
  null
from generate_series(1, 6) as source_number;

insert into public.job_sources (
  id, provider, board_token, employer_name, enabled, minimum_sync_interval,
  allowed_hosts, terms_reviewed_at, robots_reviewed_at, compliance_notes,
  last_successful_sync_at
)
values
  ('51000000-0000-4000-8000-000000000007', 'greenhouse', 'recent-source', 'Recent Source Ltd', true, interval '60 minutes', array['boards.greenhouse.io'], current_date, current_date, 'Recently completed source.', clock_timestamp()),
  ('51000000-0000-4000-8000-000000000008', 'greenhouse', 'disabled-source', 'Disabled Source Ltd', false, interval '60 minutes', array['boards.greenhouse.io'], current_date, current_date, 'Disabled source fixture.', null);

set local role service_role;

create temporary table scheduled_enqueue as
select public.enqueue_scheduled_ingestion() as inserted_count;

select is(
  (select inserted_count from scheduled_enqueue),
  6,
  'the scheduler enqueues only enabled sources whose cadence is due'
);

select is(
  (select count(*)::integer from public.ingestion_requests where trigger_type = 'scheduled'),
  6,
  'scheduled and manual work share ingestion_requests with an explicit trigger'
);

select is(
  public.enqueue_scheduled_ingestion(),
  0,
  'repeated scheduled enqueue coalesces every active source request'
);

select is(
  (select count(*)::integer from public.audit_log where action = 'ingestion.requested'),
  0,
  'coalesced scheduler delivery creates no administrator audit noise'
);

select throws_ok(
  $$ select * from public.claim_ingestion_requests(5) $$,
  '22023',
  'invalid ingestion claim limit',
  'the database rejects claims above the four-source global cap'
);

create temporary table first_claims as
select * from public.claim_ingestion_requests(4);

select is(
  (select count(*)::integer from first_claims),
  4,
  'one invocation claims no more than four sources'
);

select is(
  (select count(*)::integer from first_claims where trigger_type = 'scheduled'),
  4,
  'claimed rows retain their scheduled trigger'
);

select is(
  (
    select count(*)::integer
    from public.ingestion_requests
    where id in (select request_id from first_claims)
      and status = 'claimed'
  ),
  4,
  'claimed queue rows move atomically to claimed'
);

select is(
  (
    select count(*)::integer
    from public.ingestion_requests
    where id in (select request_id from first_claims)
      and attempt_count = 1
  ),
  4,
  'the first claim records exactly one bounded attempt'
);

select is(
  (
    select count(*)::integer
    from public.ingestion_requests
    where id in (select request_id from first_claims)
      and claim_expires_at > claimed_at
      and claim_expires_at <= claimed_at + interval '5 minutes 1 second'
  ),
  4,
  'every claim receives a five-minute recovery lease'
);

select is(
  (
    select count(*)::integer
    from public.ingestion_source_runs
    where id in (select source_run_id from first_claims)
      and status = 'running'
  ),
  4,
  'claiming creates one running source run per queue item'
);

select throws_ok(
  format(
    'select public.complete_ingestion_request(%L::uuid)',
    (select request_id from first_claims order by request_id limit 1)
  ),
  '22023',
  'ingestion run is not finalised',
  'a queue item cannot complete before its run finalises'
);

select lives_ok(
  format(
    'select public.finish_source_ingestion(%L::uuid, ''succeeded'', true, 0, 0, 0, 0, 0, 0, 0, null)',
    (select source_run_id from first_claims order by request_id limit 1)
  ),
  'a complete successful source run finalises normally'
);

select lives_ok(
  format(
    'select public.complete_ingestion_request(%L::uuid)',
    (select request_id from first_claims order by request_id limit 1)
  ),
  'a finalised run completes its shared queue item'
);

select is(
  (
    select status
    from public.ingestion_requests
    where id = (select request_id from first_claims order by request_id limit 1)
  ),
  'completed',
  'successful queue completion is persisted'
);

select lives_ok(
  format(
    'select public.complete_ingestion_request(%L::uuid)',
    (select request_id from first_claims order by request_id limit 1)
  ),
  'queue completion is idempotent'
);

select lives_ok(
  format(
    $statement$
      select * from public.upsert_ingested_jobs(%L::uuid, %L::jsonb)
    $statement$,
    (select source_run_id from first_claims order by request_id limit 1 offset 1),
    jsonb_build_array(jsonb_build_object(
      'providerJobId', 'failed-source-job',
      'title', 'Implementation Analyst',
      'employer', 'Fictional Runtime Employer',
      'descriptionText', 'Fictional analytics role.',
      'applicationUrl', 'https://boards.greenhouse.io/fictional/jobs/failed-source-job',
      'countryCode', 'GB',
      'ukEligibilityEvidence', jsonb_build_array('London, United Kingdom'),
      'employmentType', 'permanent',
      'workingTime', 'full_time',
      'workplaceType', 'hybrid',
      'ir35Status', 'not_applicable',
      'compensationRaw', null,
      'compensationMinimum', null,
      'compensationMaximum', null,
      'compensationCurrency', null,
      'compensationPeriod', 'unknown',
      'postedAt', null,
      'closesAt', null,
      'contentHash', repeat('b', 64)
    ))::text
  ),
  'a fixture job batch is written atomically before a later source failure'
);

select lives_ok(
  format(
    'select public.finish_source_ingestion(%L::uuid, ''failed'', false, 1, 1, 1, 0, 0, 10, 0, ''provider_timeout'')',
    (select source_run_id from first_claims order by request_id limit 1 offset 1)
  ),
  'a failed incomplete source run finalises without omission processing'
);

select lives_ok(
  format(
    'select public.complete_ingestion_request(%L::uuid)',
    (select request_id from first_claims order by request_id limit 1 offset 1)
  ),
  'a failed source run still completes its queue delivery'
);

select is(
  (
    select consecutive_successful_omissions
    from public.jobs
    where provider_job_id = 'failed-source-job'
  ),
  0,
  'a failed or incomplete response never increments omissions'
);

select is(
  (
    select lifecycle_status
    from public.jobs
    where provider_job_id = 'failed-source-job'
  ),
  'active',
  'a failed source cannot close an unseen job'
);

reset role;

update public.ingestion_requests
set
  requested_at = clock_timestamp() - interval '1 day',
  claim_expires_at = clock_timestamp() - interval '1 minute'
where id = (select request_id from first_claims order by request_id limit 1 offset 2);

set local role service_role;

create temporary table recovered_claim as
select * from public.claim_ingestion_requests(1);

select is(
  (select request_id from recovered_claim),
  (select request_id from first_claims order by request_id limit 1 offset 2),
  'an expired request below the ceiling is safely requeued and reclaimed'
);

select is(
  (
    select attempt_count
    from public.ingestion_requests
    where id = (select request_id from recovered_claim)
  ),
  2,
  'lease recovery increments but does not reset the attempt counter'
);

select is(
  (
    select error_code
    from public.ingestion_source_runs
    where id = (select source_run_id from first_claims order by request_id limit 1 offset 2)
  ),
  'worker_lease_expired',
  'the abandoned source run records one sanitised lease error'
);

reset role;

update public.ingestion_requests
set
  attempt_count = 3,
  requested_at = clock_timestamp() - interval '2 days',
  claim_expires_at = clock_timestamp() - interval '1 minute'
where id = (select request_id from first_claims order by request_id limit 1 offset 3);

set local role service_role;
create temporary table exhaustion_followup as
select * from public.claim_ingestion_requests(1);

select is(
  (
    select status
    from public.ingestion_requests
    where id = (select request_id from first_claims order by request_id limit 1 offset 3)
  ),
  'cancelled',
  'an expired request at the three-attempt ceiling is cancelled'
);

select is(
  (
    select last_error_code
    from public.ingestion_requests
    where id = (select request_id from first_claims order by request_id limit 1 offset 3)
  ),
  'worker_lease_expired',
  'attempt exhaustion retains only a sanitised terminal code'
);

reset role;

insert into public.job_sources (
  id, provider, board_token, employer_name, enabled, minimum_sync_interval,
  allowed_hosts, terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values (
  '51000000-0000-4000-8000-000000000009', 'greenhouse', 'disable-after-queue',
  'Disable After Queue Ltd', true, interval '60 minutes',
  array['boards.greenhouse.io'], current_date, current_date,
  'Source disabled after queue fixture.'
);

set local role service_role;
create temporary table disabled_enqueue as
select public.enqueue_scheduled_ingestion() as inserted_count;
reset role;

update public.job_sources
set enabled = false
where id = '51000000-0000-4000-8000-000000000009';

set local role service_role;
create temporary table disabled_followup as
select * from public.claim_ingestion_requests(1);

select is(
  (
    select status
    from public.ingestion_requests
    where source_id = '51000000-0000-4000-8000-000000000009'
  ),
  'cancelled',
  'a source disabled after enqueue is cancelled before provider access'
);

select is(
  (
    select last_error_code
    from public.ingestion_requests
    where source_id = '51000000-0000-4000-8000-000000000009'
  ),
  'source_disabled',
  'disabled-source cancellation records only a sanitised reason'
);

select ok(
  (
    select count(*)
    from public.ingestion_source_runs
    where status = 'running'
  ) <= 4,
  'runtime operations never exceed the four-source claim bound'
);

select * from finish();
rollback;

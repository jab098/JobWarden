begin;

create extension if not exists pgtap with schema extensions;

select plan(59);

select has_table('public', 'job_source_occurrences', 'source occurrences are persisted');
select has_column('public', 'job_sources', 'coverage_mode', 'sources declare coverage mode');
select has_column('public', 'jobs', 'compensation_provenance', 'jobs retain compensation provenance');
select has_column('public', 'jobs', 'deduplication_key', 'jobs retain an exact deduplication key');
select has_column('public', 'job_source_occurrences', 'provider_job_id', 'occurrences retain provider identity');
select has_column('public', 'job_source_occurrences', 'last_seen_source_run_id', 'occurrences retain source-run provenance');
select has_column('public', 'job_source_occurrences', 'content_hash', 'occurrences retain candidate content identity');
select has_column('public', 'job_source_occurrences', 'candidate_data', 'occurrences retain rematerialisation candidates');

select ok(
  has_function_privilege('service_role', 'public.upsert_ingested_jobs(uuid,jsonb)', 'EXECUTE'),
  'the service role can persist canonical jobs and occurrences'
);
select ok(
  not has_table_privilege('authenticated', 'public.job_source_occurrences', 'INSERT'),
  'authenticated callers cannot mutate occurrence provenance'
);
select ok(
  has_function_privilege('authenticated', 'public.get_job_source_health()', 'EXECUTE'),
  'authenticated administrators can call the RLS-gated source-health function'
);
select ok(
  not has_function_privilege('anon', 'public.get_job_source_health()', 'EXECUTE'),
  'anonymous callers cannot inspect source health'
);

select throws_ok(
  $$
    insert into public.job_sources (
      provider, board_token, employer_name, enabled, minimum_sync_interval,
      terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
      coverage_mode
    ) values (
      'reed', 'gb-discovery', 'Reed', false, interval '1 hour',
      current_date, current_date, 'Invalid short Reed cadence.',
      array['www.reed.co.uk'], 'incremental'
    )
  $$,
  '23514',
  null,
  'Reed discovery cannot run more often than every six hours'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '60000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'coverage-admin@example.test', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Coverage administrator"}', now(), now()
);

insert into public.user_roles (user_id, role, created_by)
values (
  '60000000-0000-4000-8000-000000000001',
  'admin',
  '60000000-0000-4000-8000-000000000001'
);

insert into public.job_sources (
  id, provider, board_token, employer_name, enabled, minimum_sync_interval,
  terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
  coverage_mode
) values
  (
    '61000000-0000-4000-8000-000000000001', 'greenhouse', 'canonical-fixture',
    'Canonical Fixture Ltd', true, interval '1 hour', current_date, current_date,
    'Complete Greenhouse fixture.', array['boards.greenhouse.io'], 'complete'
  ),
  (
    '61000000-0000-4000-8000-000000000002', 'reed', 'gb-discovery',
    'Reed', true, interval '6 hours', current_date, current_date,
    'Incremental Reed API fixture.', array['www.reed.co.uk'], 'incremental'
  );

insert into public.ingestion_runs (id, trigger_type)
values ('62000000-0000-4000-8000-000000000001', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id)
values (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001'
);

set local role service_role;

select lives_ok(
  $$
    select * from public.upsert_ingested_jobs(
      '63000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'providerJobId', 'greenhouse-1',
        'title', 'Implementation Consultant',
        'employer', 'Canonical Fixture Ltd',
        'descriptionText', 'UK implementation role.',
        'applicationUrl', 'https://boards.greenhouse.io/canonical/jobs/1',
        'countryCode', 'GB',
        'ukEligibilityEvidence', jsonb_build_array('London, United Kingdom'),
        'employmentType', 'permanent',
        'workingTime', 'full_time',
        'workplaceType', 'hybrid',
        'ir35Status', 'not_applicable',
        'compensationRaw', 'GBP 60000 per year',
        'compensationMinimum', 6000000,
        'compensationMaximum', null,
        'compensationCurrency', 'GBP',
        'compensationPeriod', 'year',
        'compensationProvenance', 'advertised',
        'compensationObservedAt', '2026-07-18T09:00:00Z',
        'postedAt', '2026-07-18T08:00:00Z',
        'closesAt', null,
        'deduplicationKey', repeat('a', 64),
        'contentHash', repeat('b', 64)
      ))
    )
  $$,
  'a complete source can create the canonical job and its occurrence'
);

-- The RPC above runs as service_role because the ingestion runtime does. The
-- verification below does not: service_role holds no direct privilege on
-- `jobs`, deliberately, and no runtime path reads it that way. Asserting the
-- effect as the owner keeps the boundary intact instead of widening a grant to
-- suit a test.
reset role;
select is((select count(*)::integer from public.jobs where deduplication_key = repeat('a', 64)), 1, 'one canonical job is created');
select is((select count(*)::integer from public.job_source_occurrences where job_id = (select id from public.jobs where deduplication_key = repeat('a', 64))), 1, 'the first source occurrence is retained');
set local role service_role;

select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000001', 'succeeded', true, 1, 1, 1, 0, 0, 5, 0, null) $$,
  'the initial complete snapshot finalises'
);

reset role;
insert into public.ingestion_runs (id, trigger_type)
values ('62000000-0000-4000-8000-000000000002', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id)
values ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002');
set local role service_role;

select lives_ok(
  $$
    select * from public.upsert_ingested_jobs(
      '63000000-0000-4000-8000-000000000002',
      jsonb_build_array(jsonb_build_object(
        'providerJobId', 'reed-1',
        'title', 'Implementation Consultant',
        'employer', 'Canonical Fixture Ltd',
        'descriptionText', 'UK implementation role from Reed.',
        'applicationUrl', 'https://www.reed.co.uk/jobs/implementation-consultant/1',
        'countryCode', 'GB',
        'ukEligibilityEvidence', jsonb_build_array('London, United Kingdom'),
        'employmentType', 'contract',
        'workingTime', 'part_time',
        'workplaceType', 'hybrid',
        'ir35Status', 'not_applicable',
        'compensationRaw', null,
        'compensationMinimum', null,
        'compensationMaximum', null,
        'compensationCurrency', null,
        'compensationPeriod', 'unknown',
        'compensationProvenance', 'unknown',
        'compensationObservedAt', null,
        'postedAt', '2026-07-18T08:00:00Z',
        'closesAt', clock_timestamp() + interval '30 days',
        'deduplicationKey', repeat('a', 64),
        'contentHash', repeat('c', 64)
      ))
    )
  $$,
  'an exact canonical URL key attaches a second provider occurrence'
);

reset role;
select is((select count(*)::integer from public.jobs where deduplication_key = repeat('a', 64)), 1, 'exact-key deduplication does not duplicate the canonical job');
select is((select count(*)::integer from public.job_source_occurrences where job_id = (select id from public.jobs where deduplication_key = repeat('a', 64))), 2, 'both provider occurrences remain attributable');
select is((select compensation_provenance from public.jobs where deduplication_key = repeat('a', 64)), 'advertised', 'advertised salary provenance is stored');
select is((select source_id from public.jobs where deduplication_key = repeat('a', 64)), '61000000-0000-4000-8000-000000000001'::uuid, 'advertised direct evidence wins over an unknown-salary aggregator occurrence');
select is((select application_url from public.jobs where deduplication_key = repeat('a', 64)), 'https://boards.greenhouse.io/canonical/jobs/1', 'canonical display data does not oscillate with later aggregator arrival');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
select is(
  (select advertised_compensation from public.get_job_source_health() where source_id = '61000000-0000-4000-8000-000000000001'),
  1,
  'source health counts the direct occurrence advertised salary instead of canonicalising both sources'
);
select is(
  (select unknown_compensation from public.get_job_source_health() where source_id = '61000000-0000-4000-8000-000000000002'),
  1,
  'source health retains the aggregator occurrence unknown salary'
);
select is(
  (select contract_roles from public.get_job_source_health() where source_id = '61000000-0000-4000-8000-000000000002'),
  1,
  'source health counts employment type from the provider occurrence'
);
select is(
  (select part_time_roles from public.get_job_source_health() where source_id = '61000000-0000-4000-8000-000000000002'),
  1,
  'source health counts working time from the provider occurrence'
);

reset role;
insert into public.ingestion_runs (id, trigger_type)
values ('62000000-0000-4000-8000-000000000007', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id)
values (
  '63000000-0000-4000-8000-000000000007',
  '62000000-0000-4000-8000-000000000007',
  '61000000-0000-4000-8000-000000000001'
);
set local role service_role;
select lives_ok(
  $$
    select * from public.upsert_ingested_jobs(
      '63000000-0000-4000-8000-000000000007',
      jsonb_build_array(jsonb_build_object(
        'providerJobId', 'greenhouse-1',
        'title', 'Implementation Consultant',
        'employer', 'Canonical Fixture Ltd',
        'descriptionText', 'UK implementation role after a corrected canonical URL.',
        'applicationUrl', 'https://boards.greenhouse.io/canonical/jobs/1',
        'countryCode', 'GB',
        'ukEligibilityEvidence', jsonb_build_array('London, United Kingdom'),
        'employmentType', 'permanent',
        'workingTime', 'full_time',
        'workplaceType', 'hybrid',
        'ir35Status', 'not_applicable',
        'compensationRaw', 'GBP 60000 per year',
        'compensationMinimum', 6000000,
        'compensationMaximum', null,
        'compensationCurrency', 'GBP',
        'compensationPeriod', 'year',
        'compensationProvenance', 'advertised',
        'compensationObservedAt', '2026-07-18T13:00:00Z',
        'postedAt', '2026-07-18T08:00:00Z',
        'closesAt', null,
        'deduplicationKey', repeat('f', 64),
        'contentHash', repeat('f', 64)
      ))
    )
  $$,
  'a winning direct occurrence can move to a corrected new canonical key'
);
reset role;
select is((select source_id from public.jobs where deduplication_key = repeat('a', 64)), '61000000-0000-4000-8000-000000000002'::uuid, 'the old canonical rematerialises from its remaining Reed occurrence');
set local role service_role;
select lives_ok(
  $$
    select * from public.upsert_ingested_jobs(
      '63000000-0000-4000-8000-000000000007',
      jsonb_build_array(jsonb_build_object(
        'providerJobId', 'greenhouse-1',
        'title', 'Implementation Consultant',
        'employer', 'Canonical Fixture Ltd',
        'descriptionText', 'UK implementation role.',
        'applicationUrl', 'https://boards.greenhouse.io/canonical/jobs/1',
        'countryCode', 'GB',
        'ukEligibilityEvidence', jsonb_build_array('London, United Kingdom'),
        'employmentType', 'permanent',
        'workingTime', 'full_time',
        'workplaceType', 'hybrid',
        'ir35Status', 'not_applicable',
        'compensationRaw', 'GBP 60000 per year',
        'compensationMinimum', 6000000,
        'compensationMaximum', null,
        'compensationCurrency', 'GBP',
        'compensationPeriod', 'year',
        'compensationProvenance', 'advertised',
        'compensationObservedAt', '2026-07-18T13:05:00Z',
        'postedAt', '2026-07-18T08:00:00Z',
        'closesAt', null,
        'deduplicationKey', repeat('a', 64),
        'contentHash', repeat('b', 64)
      ))
    )
  $$,
  'the direct occurrence can move back onto an existing canonical job'
);
reset role;
select is((select count(*)::integer from public.jobs where deduplication_key = repeat('f', 64)), 0, 'the orphaned temporary canonical row is removed');
select is((select source_id from public.jobs where deduplication_key = repeat('a', 64)), '61000000-0000-4000-8000-000000000001'::uuid, 'direct evidence wins regardless of provider arrival order');
set local role service_role;
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000007', 'succeeded', true, 1, 1, 0, 1, 0, 5, 0, null) $$,
  'the canonical-key correction run finalises normally'
);
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000002', 'succeeded', false, 1, 1, 0, 1, 0, 5, 0, null) $$,
  'an incremental response succeeds without pretending to be complete'
);

reset role;
insert into public.ingestion_runs (id, trigger_type) values ('62000000-0000-4000-8000-000000000003', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id) values ('63000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000002');
set local role service_role;
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000003', 'succeeded', false, 0, 0, 0, 0, 0, 5, 0, null) $$,
  'a later incremental page can omit an existing occurrence safely'
);
select is((select consecutive_successful_omissions from public.job_source_occurrences where source_id = '61000000-0000-4000-8000-000000000002'), 0, 'incremental omissions never advance lifecycle closure');

reset role;
insert into public.ingestion_runs (id, trigger_type) values ('62000000-0000-4000-8000-000000000004', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id) values ('63000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000001');
set local role service_role;
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000004', 'succeeded', true, 0, 0, 0, 0, 0, 5, 0, null) $$,
  'the first complete omission finalises'
);
select is((select consecutive_successful_omissions from public.job_source_occurrences where source_id = '61000000-0000-4000-8000-000000000001'), 1, 'a complete omission advances only its occurrence');

reset role;
insert into public.ingestion_runs (id, trigger_type) values ('62000000-0000-4000-8000-000000000005', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id) values ('63000000-0000-4000-8000-000000000005', '62000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000001');
set local role service_role;
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000005', 'succeeded', true, 0, 0, 0, 0, 0, 5, 0, null) $$,
  'the second complete omission finalises'
);
select is((select lifecycle_status from public.job_source_occurrences where source_id = '61000000-0000-4000-8000-000000000001'), 'closed', 'two complete omissions close that occurrence');
reset role;
select is((select lifecycle_status from public.jobs where deduplication_key = repeat('a', 64)), 'active', 'another active occurrence keeps the canonical job open');

reset role;
update public.job_source_occurrences set closes_at = clock_timestamp() - interval '1 minute' where source_id = '61000000-0000-4000-8000-000000000002';
insert into public.ingestion_runs (id, trigger_type) values ('62000000-0000-4000-8000-000000000006', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id) values ('63000000-0000-4000-8000-000000000006', '62000000-0000-4000-8000-000000000006', '61000000-0000-4000-8000-000000000002');
set local role service_role;
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000006', 'succeeded', false, 0, 0, 0, 0, 0, 5, 0, null) $$,
  'bounded closing-date maintenance runs after successful discovery'
);
select is((select lifecycle_status from public.job_source_occurrences where source_id = '61000000-0000-4000-8000-000000000002'), 'closed', 'the expired incremental occurrence closes explicitly');
reset role;
select is((select lifecycle_status from public.jobs where deduplication_key = repeat('a', 64)), 'closed', 'the canonical job closes only after every occurrence closes');
select is((select count(distinct job_id)::integer from public.job_source_occurrences), (select count(*)::integer from public.jobs), 'every canonical job has occurrence provenance');

reset role;
delete from public.ingestion_requests where source_id = '61000000-0000-4000-8000-000000000002';
update public.job_sources
set enabled = false
where id = '61000000-0000-4000-8000-000000000001';
update public.job_sources
set enabled = true, last_successful_sync_at = null
where id = '61000000-0000-4000-8000-000000000002';
set local role service_role;

select lives_ok(
  $$ select public.enqueue_scheduled_ingestion() $$,
  'the shared scheduler can enqueue an enabled Reed source'
);
reset role;
select is(
  (select count(*)::integer from public.ingestion_requests where source_id = '61000000-0000-4000-8000-000000000002' and status = 'pending'),
  1,
  'Reed enters the shared pending queue'
);
set local role service_role;
select lives_ok(
  $$ create temporary table reed_claim on commit drop as select * from public.claim_ingestion_requests(1) $$,
  'the shared worker can claim and start a Reed source run'
);
select is((select provider from reed_claim), 'reed', 'the claimed source retains Reed dispatch identity');
select lives_ok(
  $$
    select * from public.upsert_ingested_jobs(
      (select source_run_id from reed_claim),
      jsonb_build_array(jsonb_build_object(
        'providerJobId', 'reed-queue-1',
        'title', 'Queued Reed Consultant',
        'employer', 'Queue Fixture Ltd',
        'descriptionText', 'UK role from the shared queue.',
        'applicationUrl', 'https://www.reed.co.uk/jobs/queued-reed-consultant/1',
        'countryCode', 'GB',
        'ukEligibilityEvidence', jsonb_build_array('Manchester, United Kingdom'),
        'employmentType', 'temporary',
        'workingTime', 'full_time',
        'workplaceType', 'hybrid',
        'ir35Status', 'unknown',
        'compensationRaw', null,
        'compensationMinimum', null,
        'compensationMaximum', null,
        'compensationCurrency', null,
        'compensationPeriod', 'unknown',
        'compensationProvenance', 'unknown',
        'compensationObservedAt', null,
        'postedAt', '2026-07-18T13:00:00Z',
        'closesAt', null,
        'deduplicationKey', repeat('d', 64),
        'contentHash', repeat('e', 64)
      ))
    )
  $$,
  'a claimed Reed run persists through the shared transactional batch'
);
select lives_ok(
  $$
    do $block$
    begin
      perform public.finish_source_ingestion(
        (select source_run_id from reed_claim),
        'succeeded', false, 1, 1, 1, 0, 0, 5, 0, null
      );
      perform public.complete_ingestion_request(
        (select request_id from reed_claim)
      );
    end
    $block$
  $$,
  'the claimed Reed run finalises and completes its queue delivery'
);
reset role;
select is(
  (select status from public.ingestion_requests where id = (select request_id from reed_claim)),
  'completed',
  'the Reed queue lifecycle reaches completed'
);

reset role;
insert into public.ingestion_runs (id, trigger_type)
values ('62000000-0000-4000-8000-000000000008', 'manual');
insert into public.ingestion_source_runs (id, run_id, source_id)
values (
  '63000000-0000-4000-8000-000000000008',
  '62000000-0000-4000-8000-000000000008',
  '61000000-0000-4000-8000-000000000002'
);
update public.job_sources
set enabled = false
where id = '61000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok(
  $$
    select * from public.upsert_ingested_jobs(
      '63000000-0000-4000-8000-000000000008',
      jsonb_build_array(jsonb_build_object(
        'providerJobId', 'reed-removal-race',
        'countryCode', 'GB',
        'ukEligibilityEvidence', jsonb_build_array('United Kingdom'),
        'deduplicationKey', repeat('7', 64),
        'contentHash', repeat('8', 64)
      ))
    )
  $$,
  '22023',
  'source is not enabled for ingestion',
  'a disabled source cannot persist after a claimed-run removal race'
);
select lives_ok(
  $$ select public.finish_source_ingestion('63000000-0000-4000-8000-000000000008', 'failed', false, 0, 0, 0, 0, 0, 5, 0, 'source_disabled') $$,
  'the disabled in-flight source run can finalise safely as failed'
);

reset role;
update public.job_source_occurrences
set candidate_data = candidate_data || jsonb_build_object(
  'compensationRaw', null,
  'compensationMinimum', null,
  'compensationMaximum', null,
  'compensationCurrency', null,
  'compensationPeriod', 'unknown',
  'compensationProvenance', 'unknown',
  'compensationObservedAt', null
)
where source_id = '61000000-0000-4000-8000-000000000001';

update public.job_source_occurrences
set candidate_data = candidate_data || jsonb_build_object(
  'compensationRaw', 'GBP 60000 per year',
  'compensationMinimum', 6000000,
  'compensationMaximum', null,
  'compensationCurrency', 'GBP',
  'compensationPeriod', 'year',
  'compensationProvenance', 'advertised',
  'compensationObservedAt', '2026-07-18T14:00:00Z'
)
where source_id = '61000000-0000-4000-8000-000000000002'
  and provider_job_id = 'reed-1';

select private.rematerialize_canonical_job(
  (select id from public.jobs where deduplication_key = repeat('a', 64))
);
select is(
  (select source_id from public.jobs where deduplication_key = repeat('a', 64)),
  '61000000-0000-4000-8000-000000000002'::uuid,
  'the removal fixture starts with Reed selected for a shared canonical job'
);

create temporary table reed_affected_jobs on commit drop as
select occurrence.job_id
from public.job_source_occurrences as occurrence
join public.job_sources as source on source.id = occurrence.source_id
where source.provider = 'reed' and source.board_token = 'gb-discovery';

delete from public.job_source_occurrences as occurrence
using public.job_sources as source
where occurrence.source_id = source.id
  and source.provider = 'reed'
  and source.board_token = 'gb-discovery';

select private.rematerialize_canonical_job(affected.job_id)
from (select distinct job_id from reed_affected_jobs) as affected
where exists (
  select 1
  from public.job_source_occurrences as remaining
  where remaining.job_id = affected.job_id
);

delete from public.jobs as job
using reed_affected_jobs as affected
where job.id = affected.job_id
  and not exists (
    select 1
    from public.job_source_occurrences as remaining
    where remaining.job_id = job.id
  );

update public.job_sources
set
  enabled = false,
  compliance_notes = 'Reed provider data removed in pgTAP fixture; historical audit retained.',
  updated_at = clock_timestamp()
where provider = 'reed' and board_token = 'gb-discovery';

select is(
  (select count(*)::integer from public.job_source_occurrences where source_id = '61000000-0000-4000-8000-000000000002'),
  0,
  'provider removal deletes every Reed occurrence'
);
select is(
  (select source_id from public.jobs where deduplication_key = repeat('a', 64)),
  '61000000-0000-4000-8000-000000000001'::uuid,
  'provider removal rematerialises a shared canonical job from the surviving direct source'
);
select is(
  (select count(*)::integer from public.jobs where deduplication_key = repeat('d', 64)),
  0,
  'provider removal deletes an orphaned Reed-only canonical job'
);
select is(
  (select enabled from public.job_sources where id = '61000000-0000-4000-8000-000000000002'),
  false,
  'provider removal retains a disabled source tombstone'
);

select * from finish();
rollback;

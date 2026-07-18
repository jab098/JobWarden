begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

select has_table('public', 'job_source_occurrences', 'source occurrences are persisted');
select has_column('public', 'job_sources', 'coverage_mode', 'sources declare coverage mode');
select has_column('public', 'jobs', 'compensation_provenance', 'jobs retain compensation provenance');
select has_column('public', 'jobs', 'deduplication_key', 'jobs retain an exact deduplication key');
select has_column('public', 'job_source_occurrences', 'provider_job_id', 'occurrences retain provider identity');
select has_column('public', 'job_source_occurrences', 'last_seen_source_run_id', 'occurrences retain source-run provenance');

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

insert into public.job_sources (
  id, provider, board_token, employer_name, enabled, minimum_sync_interval,
  terms_reviewed_at, robots_reviewed_at, compliance_notes, allowed_hosts,
  coverage_mode
) values
  (
    '61000000-0000-4000-8000-000000000001', 'greenhouse', 'canonical-fixture',
    'Canonical Fixture Ltd', false, interval '1 hour', current_date, current_date,
    'Complete Greenhouse fixture.', array['boards.greenhouse.io'], 'complete'
  ),
  (
    '61000000-0000-4000-8000-000000000002', 'reed', 'gb-discovery',
    'Reed', false, interval '6 hours', current_date, current_date,
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

select is((select count(*)::integer from public.jobs where deduplication_key = repeat('a', 64)), 1, 'one canonical job is created');
select is((select count(*)::integer from public.job_source_occurrences where job_id = (select id from public.jobs where deduplication_key = repeat('a', 64))), 1, 'the first source occurrence is retained');

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
        'compensationObservedAt', '2026-07-18T12:00:00Z',
        'postedAt', '2026-07-18T08:00:00Z',
        'closesAt', clock_timestamp() + interval '30 days',
        'deduplicationKey', repeat('a', 64),
        'contentHash', repeat('c', 64)
      ))
    )
  $$,
  'an exact canonical URL key attaches a second provider occurrence'
);

select is((select count(*)::integer from public.jobs where deduplication_key = repeat('a', 64)), 1, 'exact-key deduplication does not duplicate the canonical job');
select is((select count(*)::integer from public.job_source_occurrences where job_id = (select id from public.jobs where deduplication_key = repeat('a', 64))), 2, 'both provider occurrences remain attributable');
select is((select compensation_provenance from public.jobs where deduplication_key = repeat('a', 64)), 'advertised', 'advertised salary provenance is stored');
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
select is((select lifecycle_status from public.jobs where deduplication_key = repeat('a', 64)), 'closed', 'the canonical job closes only after every occurrence closes');
select is((select count(distinct job_id)::integer from public.job_source_occurrences), (select count(*)::integer from public.jobs), 'every canonical job has occurrence provenance');

select * from finish();
rollback;

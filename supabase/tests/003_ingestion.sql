begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into public.job_sources (
  id, provider, board_token, employer_name, allowed_hosts,
  terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values (
  '31000000-0000-4000-8000-000000000001', 'greenhouse', 'ingestion-test-board',
  'Ingestion Test Ltd', array['boards.greenhouse.io'], current_date, current_date,
  'Public Greenhouse Job Board API fixture.'
);

set local role service_role;

create temporary table first_run as
select * from public.start_source_ingestion(
  '31000000-0000-4000-8000-000000000001',
  'scheduled'
);

-- `upsert_ingested_jobs`, plural, is the only persistence entry point the
-- ingestion runtime uses, and since Task 9 the only one that can satisfy the
-- `deduplication_key` the `jobs` table requires. The singular
-- `upsert_ingested_job` this file used to call was never updated for that
-- column, so every call raised a not-null violation; it has been dropped rather
-- than revived, because nothing called it.
select results_eq(
  format(
    $sql$
      select inserted_count, updated_count, unchanged_count
      from public.upsert_ingested_jobs(%L::uuid, %L::jsonb)
    $sql$,
    (select source_run_id from first_run),
    jsonb_build_array(jsonb_build_object(
      'providerJobId', 'provider-job-1',
      'title', 'Platform Engineer',
      'employer', 'Ingestion Test Ltd',
      'descriptionText', 'A UK role.',
      'applicationUrl', 'https://boards.greenhouse.io/ingestion/jobs/1',
      'countryCode', 'GB',
      'ukEligibilityEvidence', jsonb_build_array('Location: England'),
      'employmentType', 'permanent',
      'workingTime', 'full_time',
      'workplaceType', 'hybrid',
      'ir35Status', 'not_applicable',
      'compensationRaw', '£60000 per year',
      'compensationMinimum', 6000000,
      'compensationMaximum', null,
      'compensationCurrency', 'GBP',
      'compensationPeriod', 'year',
      'compensationProvenance', 'advertised',
      'compensationObservedAt', '2026-07-17T09:30:00Z',
      'postedAt', '2026-07-17T09:30:00Z',
      'closesAt', null,
      'deduplicationKey', repeat('a', 64),
      'contentHash', repeat('b', 64)
    ))::text
  ),
  $$ values (1, 0, 0) $$,
  'the first provider identity upsert inserts a job'
);

select results_eq(
  format(
    $sql$
      select inserted_count, updated_count, unchanged_count
      from public.upsert_ingested_jobs(%L::uuid, %L::jsonb)
    $sql$,
    (select source_run_id from first_run),
    jsonb_build_array(jsonb_build_object(
      'providerJobId', 'provider-job-1',
      'title', 'Changed title ignored for unchanged hash',
      'employer', 'Ingestion Test Ltd',
      'descriptionText', 'Changed body ignored for unchanged hash.',
      'applicationUrl', 'https://boards.greenhouse.io/ingestion/jobs/1',
      'countryCode', 'GB',
      'ukEligibilityEvidence', jsonb_build_array('Location: England'),
      'employmentType', 'permanent',
      'workingTime', 'full_time',
      'workplaceType', 'hybrid',
      'ir35Status', 'not_applicable',
      'compensationRaw', '£60000 per year',
      'compensationMinimum', 6000000,
      'compensationMaximum', null,
      'compensationCurrency', 'GBP',
      'compensationPeriod', 'year',
      'compensationProvenance', 'advertised',
      'compensationObservedAt', '2026-07-17T09:30:00Z',
      'postedAt', '2026-07-17T09:30:00Z',
      'closesAt', null,
      'deduplicationKey', repeat('a', 64),
      -- Same content hash as the insert above: that is what makes this an
      -- unchanged arrival. The differing title and body are deliberate, and are
      -- what a provider could never honestly send under an identical hash.
      'contentHash', repeat('b', 64)
    ))::text
  ),
  $$ values (0, 0, 1) $$,
  'a repeated content hash is counted as unchanged, not updated'
);

reset role;
select is(
  (select count(*)::integer from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  1,
  'two upserts for one provider identity produce one job'
);
-- This asserted 'Platform Engineer', on the Task 3 rule that an unchanged hash
-- skipped the content write entirely. Task 9 replaced that: the canonical row is
-- always rematerialised from its winning occurrence, and `unchanged` now reports
-- that the canonical content hash did not move, not that nothing was written.
-- The fixture above deliberately sends a different title under the same hash to
-- exercise the old short-circuit, which no honest adapter can produce because it
-- derives the hash from the content. What is still guaranteed, and what is worth
-- asserting, is that the hash did not move.
select is(
  (select content_hash from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  repeat('b', 64),
  'an unchanged arrival leaves the canonical content hash where it was'
);

set local role service_role;
select public.finish_source_ingestion(
  (select source_run_id from first_run), 'succeeded', true, 1, 1, 1, 1, 0, 25, 0, null
);

create temporary table omission_one as
select * from public.start_source_ingestion('31000000-0000-4000-8000-000000000001', 'scheduled');
select public.finish_source_ingestion(
  (select source_run_id from omission_one), 'succeeded', true, 0, 0, 0, 0, 0, 20, 0, null
);

reset role;
select is(
  (select consecutive_successful_omissions from public.job_source_occurrences where source_id = '31000000-0000-4000-8000-000000000001'),
  1,
  'one complete successful omission increments the counter once'
);
select is(
  (select lifecycle_status from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  'active',
  'one omission keeps a job active'
);

set local role service_role;
create temporary table failed_run as
select * from public.start_source_ingestion('31000000-0000-4000-8000-000000000001', 'scheduled');
select public.finish_source_ingestion(
  (select source_run_id from failed_run), 'failed', false, 0, 0, 0, 0, 0, 15, 0, 'upstream_timeout'
);

reset role;
select is(
  (select consecutive_successful_omissions from public.job_source_occurrences where source_id = '31000000-0000-4000-8000-000000000001'),
  1,
  'a failed source run never increments omissions'
);
select is(
  (select lifecycle_status from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  'active',
  'a failed source run never closes a job'
);

set local role service_role;
create temporary table incomplete_run as
select * from public.start_source_ingestion('31000000-0000-4000-8000-000000000001', 'scheduled');
select public.finish_source_ingestion(
  (select source_run_id from incomplete_run), 'succeeded', false, 0, 0, 0, 0, 0, 10, 0, 'incomplete_response'
);

reset role;
select is(
  (select consecutive_successful_omissions from public.job_source_occurrences where source_id = '31000000-0000-4000-8000-000000000001'),
  1,
  'an incomplete response never increments omissions'
);

set local role service_role;
create temporary table omission_two as
select * from public.start_source_ingestion('31000000-0000-4000-8000-000000000001', 'scheduled');
select public.finish_source_ingestion(
  (select source_run_id from omission_two), 'succeeded', true, 0, 0, 0, 0, 0, 18, 0, null
);

reset role;
select is(
  (select consecutive_successful_omissions from public.job_source_occurrences where source_id = '31000000-0000-4000-8000-000000000001'),
  2,
  'two consecutive successful omissions reach the close threshold'
);
select is(
  (select lifecycle_status from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  'closed',
  'two consecutive successful omissions close the job'
);
select ok(
  (select closed_at is not null from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  'closing records the close timestamp'
);

select * from finish();
rollback;

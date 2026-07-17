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

select results_eq(
  format(
    $sql$
      select outcome
      from public.upsert_ingested_job(
        %L, 'provider-job-1', 'Platform Engineer', 'Ingestion Test Ltd',
        'A UK role.', 'https://boards.greenhouse.io/ingestion/jobs/1', 'GB',
        array['Location: England'], 'permanent', 'full_time', 'hybrid',
        'not_applicable', '£60000 per year', 6000000, null, 'GBP', 'year',
        '2026-07-17T09:30:00Z', null, %L
      )
    $sql$,
    (select source_run_id from first_run),
    repeat('a', 64)
  ),
  $$ values ('inserted'::text) $$,
  'the first provider identity upsert inserts a job'
);

select results_eq(
  format(
    $sql$
      select outcome
      from public.upsert_ingested_job(
        %L, 'provider-job-1', 'Changed title ignored for unchanged hash', 'Ingestion Test Ltd',
        'Changed body ignored for unchanged hash.', 'https://boards.greenhouse.io/ingestion/jobs/1', 'GB',
        array['Location: England'], 'permanent', 'full_time', 'hybrid',
        'not_applicable', '£60000 per year', 6000000, null, 'GBP', 'year',
        '2026-07-17T09:30:00Z', null, %L
      )
    $sql$,
    (select source_run_id from first_run),
    repeat('a', 64)
  ),
  $$ values ('unchanged'::text) $$,
  'an unchanged content hash avoids a content rewrite'
);

reset role;
select is(
  (select count(*)::integer from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  1,
  'two upserts for one provider identity produce one job'
);
select is(
  (select title from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
  'Platform Engineer',
  'unchanged content preserves stored content fields'
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
  (select consecutive_successful_omissions from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
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
  (select consecutive_successful_omissions from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
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
  (select consecutive_successful_omissions from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
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
  (select consecutive_successful_omissions from public.jobs where source_id = '31000000-0000-4000-8000-000000000001'),
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

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

-- A Greenhouse board and an Adzuna national source. Adzuna's row constraint
-- fixes its coverage mode and host, so both are set explicitly.
insert into public.job_sources (
  id, provider, board_token, employer_name, allowed_hosts,
  terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values (
  '21000000-0000-4000-8000-0000000000a1', 'greenhouse', 'prov-test-board',
  'Prov Test Ltd', array['boards.greenhouse.io'], current_date, current_date,
  'Fixture.'
);

insert into public.job_sources (
  id, provider, board_token, employer_name, allowed_hosts, coverage_mode,
  terms_reviewed_at, robots_reviewed_at, compliance_notes
)
values (
  '21000000-0000-4000-8000-0000000000a2', 'adzuna', 'gb-discovery', 'Adzuna',
  array['www.adzuna.co.uk'], 'incremental', current_date, current_date,
  'Fixture.'
);

insert into public.jobs (
  source_id, provider_job_id, title, employer, description_text,
  application_url, country_code, uk_eligibility_evidence, employment_type,
  working_time, workplace_type, ir35_status, compensation_period, content_hash,
  deduplication_key, lifecycle_status
)
values
  (
    '21000000-0000-4000-8000-0000000000a1', 'prov-gh-1', 'GH role',
    'Prov Test Ltd', 'A UK role.', 'https://boards.greenhouse.io/prov/jobs/1',
    'GB', array['Location: Scotland'], 'permanent', 'full_time', 'remote',
    'not_applicable', 'year', repeat('a', 64), repeat('b', 64), 'active'
  ),
  (
    '21000000-0000-4000-8000-0000000000a2', 'prov-adz-1', 'Adzuna role',
    'Some Employer', 'A UK role.', 'https://www.adzuna.co.uk/details/1', 'GB',
    array['Location: London, EC2A 4NE'], 'permanent', 'full_time', 'remote',
    'not_applicable', 'year', repeat('c', 64), repeat('d', 64), 'active'
  );

select is(
  (select source_provider from public.jobs where provider_job_id = 'prov-gh-1'),
  'greenhouse',
  'the trigger denormalises a greenhouse job''s provider onto the row'
);

select is(
  (select source_provider from public.jobs where provider_job_id = 'prov-adz-1'),
  'adzuna',
  'the trigger denormalises an adzuna job''s provider, so attribution can render'
);

-- Repointing a job to a source with another provider updates the value.
update public.jobs
set source_id = '21000000-0000-4000-8000-0000000000a1'
where provider_job_id = 'prov-adz-1';

select is(
  (select source_provider from public.jobs where provider_job_id = 'prov-adz-1'),
  'greenhouse',
  'the trigger re-derives the provider when a job is repointed to another source'
);

select * from finish();

rollback;

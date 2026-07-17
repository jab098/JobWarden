create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_settings (
  singleton boolean primary key default true check (singleton),
  allow_access_requests boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into private.app_settings (singleton, allow_access_requests)
values (true, true)
on conflict (singleton) do nothing;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 0 and 200),
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_reason text check (
    decision_reason is null
    or char_length(decision_reason) between 3 and 500
  ),
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (
    char_length(action) between 3 and 100
    and action ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  resource_type text not null check (
    char_length(resource_type) between 2 and 100
    and resource_type ~ '^[a-z0-9_]+$'
  ),
  resource_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (
    char_length(provider) between 2 and 50
    and provider ~ '^[a-z][a-z0-9_-]*$'
  ),
  board_token text not null check (char_length(board_token) between 1 and 200),
  employer_name text not null check (char_length(employer_name) between 1 and 300),
  enabled boolean not null default true,
  minimum_sync_interval interval not null default interval '1 hour'
    check (minimum_sync_interval >= interval '5 minutes'),
  last_successful_sync_at timestamptz,
  terms_reviewed_at date not null,
  robots_reviewed_at date not null,
  allowed_method text not null default 'GET' check (allowed_method = 'GET'),
  compliance_notes text not null check (char_length(compliance_notes) between 3 and 5000),
  allowed_hosts text[] not null check (cardinality(allowed_hosts) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, board_token)
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled', 'admin', 'manual')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_count integer not null default 0 check (source_count >= 0),
  job_count integer not null default 0 check (job_count >= 0),
  error_summary text check (
    error_summary is null
    or (
      char_length(error_summary) between 3 and 100
      and error_summary ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    )
  )
);

create table public.ingestion_source_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ingestion_runs (id) on delete cascade,
  source_id uuid not null references public.job_sources (id) on delete restrict,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  response_complete boolean not null default false,
  http_status integer check (http_status between 100 and 599),
  received_count integer not null default 0 check (received_count >= 0),
  eligible_count integer not null default 0 check (eligible_count >= 0),
  upserted_count integer not null default 0 check (upserted_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  closed_count integer not null default 0 check (closed_count >= 0),
  duration_ms integer check (duration_ms >= 0),
  retry_count integer not null default 0 check (retry_count between 0 and 10),
  error_code text check (
    error_code is null
    or (
      char_length(error_code) between 3 and 100
      and error_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    )
  ),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (run_id, source_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources (id) on delete restrict,
  provider_job_id text not null check (char_length(provider_job_id) between 1 and 200),
  title text not null check (char_length(title) between 1 and 300),
  employer text not null check (char_length(employer) between 1 and 300),
  description_text text not null check (char_length(description_text) <= 100000),
  application_url text not null,
  country_code text not null,
  uk_eligibility_evidence text[] not null check (cardinality(uk_eligibility_evidence) > 0),
  employment_type text not null check (
    employment_type in (
      'permanent', 'fixed_term', 'contract', 'temporary', 'apprenticeship',
      'internship', 'casual', 'zero_hours', 'unknown'
    )
  ),
  working_time text not null check (working_time in ('full_time', 'part_time', 'flexible', 'unknown')),
  workplace_type text not null check (workplace_type in ('onsite', 'hybrid', 'remote', 'unknown')),
  ir35_status text not null check (ir35_status in ('inside', 'outside', 'not_applicable', 'unknown')),
  compensation_raw text check (compensation_raw is null or char_length(compensation_raw) <= 1000),
  compensation_minimum integer check (compensation_minimum is null or compensation_minimum >= 0),
  compensation_maximum integer check (compensation_maximum is null or compensation_maximum >= 0),
  compensation_currency text check (compensation_currency is null or compensation_currency = 'GBP'),
  compensation_period text not null check (compensation_period in ('hour', 'day', 'week', 'month', 'year', 'unknown')),
  posted_at timestamptz,
  closes_at timestamptz,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_source_run_id uuid references public.ingestion_source_runs (id) on delete set null,
  consecutive_successful_omissions integer not null default 0,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'closed', 'quarantined')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_provider_identity_unique unique (source_id, provider_job_id),
  constraint jobs_country_gb check (country_code = 'GB'),
  constraint jobs_https_application check (application_url ~ '^https://'),
  constraint jobs_omissions_nonnegative check (consecutive_successful_omissions >= 0),
  constraint jobs_compensation_range check (
    compensation_minimum is null
    or compensation_maximum is null
    or compensation_maximum >= compensation_minimum
  )
);

create table public.job_locations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  raw_location text not null check (char_length(raw_location) between 1 and 1000),
  town_city text check (town_city is null or char_length(town_city) <= 200),
  region text check (region is null or char_length(region) <= 200),
  nation text check (nation is null or nation in ('England', 'Scotland', 'Wales', 'Northern Ireland')),
  postcode_fragment text check (postcode_fragment is null or char_length(postcode_fragment) <= 8),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  remote_eligibility text not null default 'unknown'
    check (remote_eligibility in ('uk', 'not_remote', 'ambiguous', 'unknown')),
  created_at timestamptz not null default now()
);

create index jobs_feed_idx on public.jobs (lifecycle_status, posted_at desc);
create index jobs_filter_idx on public.jobs (employment_type, working_time, workplace_type, ir35_status);
create index access_requests_status_idx on public.access_requests (status, requested_at);
create index ingestion_runs_started_idx on public.ingestion_runs (started_at desc);
create index ingestion_source_runs_source_idx on public.ingestion_source_runs (source_id, started_at desc);
create unique index ingestion_source_runs_one_running_idx
  on public.ingestion_source_runs (source_id)
  where status = 'running';
create index job_locations_job_idx on public.job_locations (job_id);

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant select on public.profiles, public.access_requests, public.user_roles,
  public.audit_log, public.job_sources, public.jobs, public.job_locations,
  public.ingestion_runs, public.ingestion_source_runs to authenticated;

grant select, insert on public.user_roles to service_role;
grant insert on public.audit_log to service_role;
grant select on public.job_sources to service_role;

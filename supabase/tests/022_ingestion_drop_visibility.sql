begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- The columns exist and are non-null with a safe default, so a run recorded by
-- an older caller reads as "nothing dropped" rather than as null arithmetic.
select has_column(
  'public', 'ingestion_source_runs', 'excluded_non_uk_count',
  'the non-UK exclusion count exists'
);
select has_column(
  'public', 'ingestion_source_runs', 'quarantined_ambiguous_count',
  'the unrecognised-location quarantine count exists'
);
select has_column(
  'public', 'ingestion_source_runs', 'quarantined_invalid_url_count',
  'the unusable-link quarantine count exists'
);
select has_column(
  'public', 'ingestion_source_runs', 'unrecognised_locations',
  'the unrecognised location list exists'
);
select col_not_null(
  'public', 'ingestion_source_runs', 'excluded_non_uk_count',
  'the non-UK exclusion count is never null'
);
select col_not_null(
  'public', 'ingestion_source_runs', 'unrecognised_locations',
  'the unrecognised location list is never null'
);
select col_type_is(
  'public', 'ingestion_source_runs', 'unrecognised_locations', 'jsonb',
  'the unrecognised location list is jsonb'
);

-- The eleven-argument overload must be gone, not merely shadowed: leaving it
-- callable would let a caller finalise a run recording no drop reasons at all.
select hasnt_function(
  'public', 'finish_source_ingestion',
  array[
    'uuid', 'text', 'boolean', 'integer', 'integer', 'integer', 'integer',
    'integer', 'integer', 'integer', 'text'
  ],
  'the drop-blind overload of finish_source_ingestion is dropped'
);
select has_function(
  'public', 'finish_source_ingestion',
  array[
    'uuid', 'text', 'boolean', 'integer', 'integer', 'integer', 'integer',
    'integer', 'integer', 'integer', 'text', 'integer', 'integer', 'integer',
    'jsonb'
  ],
  'finish_source_ingestion accepts the drop breakdown'
);
select is_definer(
  'public', 'finish_source_ingestion',
  array[
    'uuid', 'text', 'boolean', 'integer', 'integer', 'integer', 'integer',
    'integer', 'integer', 'integer', 'text', 'integer', 'integer', 'integer',
    'jsonb'
  ],
  'the finalisation RPC still runs as security definer'
);

-- Constraints. Each is the boundary a malformed or hostile payload meets.
select throws_ok(
  $$insert into public.ingestion_source_runs (run_id, source_id, excluded_non_uk_count)
    values (gen_random_uuid(), gen_random_uuid(), -1)$$,
  null,
  'a negative drop count is rejected'
);
select throws_ok(
  $$insert into public.ingestion_source_runs (run_id, source_id, unrecognised_locations)
    values (gen_random_uuid(), gen_random_uuid(), '{"a":1}'::jsonb)$$,
  null,
  'a non-array unrecognised location value is rejected'
);
select throws_ok(
  $$insert into public.ingestion_source_runs (run_id, source_id, unrecognised_locations)
    values (
      gen_random_uuid(), gen_random_uuid(),
      (select jsonb_agg(to_jsonb('town ' || generated)) from generate_series(1, 26) as generated)
    )$$,
  null,
  'more than twenty-five unrecognised locations is rejected'
);

-- Force-RLS is unchanged: this task added columns, never a table.
select is(
  (
    select count(*)::integer
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relrowsecurity
      and relforcerowsecurity
  ),
  32,
  'the forced-RLS table count is unchanged'
);

select * from finish();

rollback;

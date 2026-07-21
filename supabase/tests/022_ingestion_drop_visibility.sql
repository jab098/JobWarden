begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

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

-- The recreated function must be closed to the browser roles. `drop` plus
-- `create` starts from PostgreSQL's default ACL rather than inheriting the
-- privileges the dropped overload carried, and because service_role belongs to
-- PUBLIC an over-permissive grant would not break ingestion or show up anywhere.
select ok(
  not has_function_privilege(
    'anon',
    'public.finish_source_ingestion(uuid,text,boolean,integer,integer,integer,integer,integer,integer,integer,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ),
  'the finalisation RPC is closed to anon'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.finish_source_ingestion(uuid,text,boolean,integer,integer,integer,integer,integer,integer,integer,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ),
  'the finalisation RPC is closed to authenticated callers'
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

-- Every public table forces RLS. This replaces a hardcoded count of 32, which
-- broke whenever a table was legitimately added (it reached 34) and, worse,
-- could be satisfied while a hole existed: adding one forced table and dropping
-- RLS from another leaves the count unchanged. Naming the offenders states the
-- invariant directly and needs no edit when the schema grows.
select is_empty(
  $$
    select c.relname
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not (c.relrowsecurity and c.relforcerowsecurity)
    order by c.relname
  $$,
  'every public table enables and forces row-level security'
);

select * from finish();

rollback;

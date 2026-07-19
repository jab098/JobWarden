begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_function(
  'public', 'export_career_profile_data', array[]::text[],
  'owners can export their own data, not only delete it'
);
select is_definer(
  'public', 'export_career_profile_data', array[]::text[],
  'the export runs as security definer'
);
select ok(
  not has_function_privilege(
    'anon', 'public.export_career_profile_data()', 'EXECUTE'
  ),
  'anonymous callers cannot export'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.export_career_profile_data()', 'EXECUTE'
  ),
  'approved users can export'
);
select throws_ok(
  $$ select public.export_career_profile_data() $$,
  '42501',
  null,
  'an unauthenticated caller is refused'
);

-- The export must never become a route for pulling CV bytes out through the
-- Data API; only metadata is returned.
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'export_career_profile_data'
      and pg_proc.prosrc like '%storage_path%'
  ),
  0,
  'the export returns CV metadata rather than storage paths'
);

select * from finish();

rollback;

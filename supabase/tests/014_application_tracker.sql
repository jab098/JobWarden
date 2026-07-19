begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select has_table('public', 'career_applications', 'tracked applications are persisted');
select has_table('public', 'career_application_events', 'application audit events are persisted');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in ('career_applications', 'career_application_events')
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  2,
  'both application tables enable and force RLS'
);

select policies_are(
  'public',
  'career_applications',
  array['approved users read own applications'],
  'applications expose only the owner select policy'
);
select policies_are(
  'public',
  'career_application_events',
  array['approved users read own application events'],
  'application events expose only the owner select policy'
);

select fk_ok(
  'public', 'career_application_events', 'application_id',
  'public', 'career_applications', 'id',
  'events belong to a tracked application'
);

select has_function(
  'public', 'track_career_application', array['uuid'],
  'the application tracking RPC exists'
);
select has_function(
  'public', 'transition_career_application', array['uuid', 'text'],
  'the audited transition RPC exists'
);
select has_function(
  'public', 'update_career_application_plan', array['uuid', 'text', 'date', 'text'],
  'the next-action plan RPC exists'
);
select has_function(
  'public', 'delete_career_application', array['uuid'],
  'the application deletion RPC exists'
);

select is_definer(
  'public', 'transition_career_application', array['uuid', 'text'],
  'transitions run as security definer'
);
select is_definer(
  'public', 'track_career_application', array['uuid'],
  'tracking runs as security definer'
);

select ok(
  not has_function_privilege('anon', 'public.track_career_application(uuid)', 'EXECUTE'),
  'anonymous callers cannot track applications'
);
select ok(
  has_function_privilege('authenticated', 'public.track_career_application(uuid)', 'EXECUTE'),
  'authenticated owners can track applications'
);
select ok(
  not has_function_privilege('anon', 'public.transition_career_application(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot transition applications'
);
select ok(
  has_function_privilege('authenticated', 'public.transition_career_application(uuid,text)', 'EXECUTE'),
  'authenticated owners can transition applications'
);

select ok(
  not has_table_privilege('authenticated', 'public.career_applications', 'INSERT'),
  'approved users cannot insert applications directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_applications', 'UPDATE'),
  'approved users cannot update applications directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_applications', 'DELETE'),
  'approved users cannot delete applications directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_application_events', 'INSERT'),
  'approved users cannot forge audit events'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_application_events', 'UPDATE'),
  'audit events cannot be rewritten by users'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_application_events', 'DELETE'),
  'audit events cannot be erased directly by users'
);

select throws_ok(
  $$ select public.track_career_application('00000000-0000-4000-8000-000000000001'::uuid) $$,
  '42501',
  null,
  'tracking requires an authenticated approved actor'
);
select throws_ok(
  $$ select public.transition_career_application(
    '00000000-0000-4000-8000-000000000001'::uuid, 'screening'
  ) $$,
  '42501',
  null,
  'transitions require an authenticated approved actor'
);

select throws_ok(
  $$ insert into public.career_applications (owner_id, job_id, stage)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'ghosted') $$,
  '23514',
  null,
  'applications reject stages outside the explicit vocabulary'
);
select throws_ok(
  $$ insert into public.career_application_events (application_id, owner_id, from_stage, to_stage)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'applied', 'ghosted') $$,
  '23514',
  null,
  'audit events reject stages outside the explicit vocabulary'
);

select * from finish();

rollback;

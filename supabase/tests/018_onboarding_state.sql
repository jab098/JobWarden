begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table('public', 'career_onboarding_state', 'onboarding state is persisted');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'career_onboarding_state'
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  1,
  'onboarding state enables and forces RLS'
);

select policies_are(
  'public',
  'career_onboarding_state',
  array['approved users read own onboarding state'],
  'onboarding state exposes only the owner select policy'
);

select has_function(
  'public', 'advance_onboarding', array['text', 'text', 'text'],
  'the owner-fenced step RPC exists'
);
select has_function(
  'public', 'complete_onboarding', array[]::text[],
  'the completion RPC exists'
);
select is_definer(
  'public', 'complete_onboarding', array[]::text[],
  'completion runs as security definer'
);
select ok(
  not has_function_privilege('anon', 'public.complete_onboarding()', 'EXECUTE'),
  'anonymous callers cannot finish onboarding'
);

-- The step vocabulary is enforced in the database, so a crafted call cannot
-- record a step the chosen path never asks.
select is(
  public.onboarding_steps_for_path('cv'),
  array['cv', 'confirm_evidence', 'preferences', 'notifications', 'review'],
  'the CV path asks the user to confirm what was read'
);
select is(
  public.onboarding_steps_for_path('aspiration'),
  array['cv', 'aspirations', 'preferences', 'notifications', 'review'],
  'the aspiration path asks about direction instead'
);
select is(
  public.onboarding_steps_for_path('wizard'),
  array[]::text[],
  'an unknown path yields no steps, so nothing can be recorded against it'
);

select throws_ok(
  $$ select public.advance_onboarding('cv', 'aspirations', null) $$,
  '42501',
  null,
  'an unauthenticated caller is refused before step validation'
);

select throws_ok(
  $$ insert into public.career_onboarding_state (owner_id, path)
     values ('00000000-0000-4000-8000-000000000001', 'wizard') $$,
  '23514',
  null,
  'a path outside the vocabulary is rejected'
);
select throws_ok(
  $$ insert into public.career_onboarding_state (owner_id, completed_steps)
     values ('00000000-0000-4000-8000-000000000001', array['teleport']) $$,
  '23514',
  null,
  'a step outside the vocabulary is rejected'
);
select throws_ok(
  $$ insert into public.career_onboarding_state (owner_id, cv_outcome)
     values ('00000000-0000-4000-8000-000000000001', 'excellent') $$,
  '23514',
  null,
  'a CV outcome outside the vocabulary is rejected'
);

select * from finish();

rollback;

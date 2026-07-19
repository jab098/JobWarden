begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_table('public', 'explore_pathways', 'the curated pathway taxonomy is persisted');
select is(
  (select count(*)::integer from public.explore_pathways),
  8,
  'the curated pathway seed matches the eight-domain taxonomy'
);
select has_table('public', 'career_explore_settings', 'explore opt-in state is persisted');
select has_table('public', 'career_pathway_decisions', 'pathway decisions are persisted');
select has_table('public', 'explore_pathway_analytics', 'aggregate pathway analytics are persisted');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'career_explore_settings',
        'career_pathway_decisions',
        'explore_pathway_analytics',
        'explore_pathways'
      )
      and pg_class.relrowsecurity
      and pg_class.relforcerowsecurity
  ),
  4,
  'all explore tables enable and force RLS'
);

select fk_ok(
  'public', 'career_pathway_decisions', 'pathway_concept',
  'public', 'explore_pathways', 'pathway_concept',
  'pathway decisions reference only curated pathways'
);
select fk_ok(
  'public', 'explore_pathway_analytics', 'pathway_concept',
  'public', 'explore_pathways', 'pathway_concept',
  'aggregate analytics reference only curated pathways'
);

select policies_are(
  'public',
  'career_explore_settings',
  array['approved users read own explore settings'],
  'explore settings expose only the owner select policy'
);
select policies_are(
  'public',
  'career_pathway_decisions',
  array['approved users read own pathway decisions'],
  'pathway decisions expose only the owner select policy'
);
select policies_are(
  'public',
  'explore_pathway_analytics',
  array[]::text[],
  'aggregate analytics expose no authenticated policy at all'
);

select columns_are(
  'public',
  'explore_pathway_analytics',
  array['pathway_concept', 'event', 'event_count'],
  'aggregate analytics hold only a concept, an event, and a counter - no owner or free text'
);

select has_function(
  'public', 'set_explore_enabled', array['boolean'],
  'the explore opt-in RPC exists'
);
select has_function(
  'public', 'decide_career_pathway', array['text', 'text'],
  'the owner-fenced pathway decision RPC exists'
);
select is_definer(
  'public', 'set_explore_enabled', array['boolean'],
  'explore opt-in runs as security definer'
);
select is_definer(
  'public', 'decide_career_pathway', array['text', 'text'],
  'pathway decisions run as security definer'
);

select ok(
  not has_function_privilege('anon', 'public.set_explore_enabled(boolean)', 'EXECUTE'),
  'anonymous callers cannot toggle explore'
);
select ok(
  has_function_privilege('authenticated', 'public.set_explore_enabled(boolean)', 'EXECUTE'),
  'authenticated owners can toggle explore'
);
select ok(
  not has_function_privilege('anon', 'public.decide_career_pathway(text,text)', 'EXECUTE'),
  'anonymous callers cannot decide pathways'
);
select ok(
  has_function_privilege('authenticated', 'public.decide_career_pathway(text,text)', 'EXECUTE'),
  'authenticated owners can decide pathways'
);

select ok(
  not has_table_privilege('authenticated', 'public.career_explore_settings', 'INSERT'),
  'approved users cannot insert explore settings directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_pathway_decisions', 'INSERT'),
  'approved users cannot insert pathway decisions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.career_pathway_decisions', 'UPDATE'),
  'approved users cannot update pathway decisions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.explore_pathway_analytics', 'SELECT'),
  'approved users cannot read aggregate analytics directly'
);

select throws_ok(
  $$ select public.set_explore_enabled(true) $$,
  '42501',
  null,
  'toggling explore requires an authenticated approved actor'
);
select throws_ok(
  $$ select public.decide_career_pathway('product analytics implementation', 'dismissed') $$,
  '42501',
  null,
  'pathway decisions require an authenticated approved actor'
);

select throws_ok(
  $$ insert into public.explore_pathway_analytics (pathway_concept, event, event_count)
     values ('Contains Uppercase CV Text', 'dismissed', 1) $$,
  '23514',
  null,
  'analytics reject free text outside the normalised-concept grammar'
);
select throws_ok(
  $$ insert into public.explore_pathway_analytics (pathway_concept, event, event_count)
     values ('grammar valid but not curated', 'dismissed', 1) $$,
  '23503',
  null,
  'analytics reject grammar-valid concepts outside the curated taxonomy'
);
select throws_ok(
  $$ insert into public.explore_pathway_analytics (pathway_concept, event, event_count)
     values ('product analytics implementation', 'viewed', 1) $$,
  '23514',
  null,
  'analytics reject unknown event names'
);

select * from finish();

rollback;

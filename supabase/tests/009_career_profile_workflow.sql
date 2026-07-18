begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_column('public', 'career_profiles', 'target_role_families', 'target role families persist');
select has_column('public', 'career_profiles', 'industries', 'industry preferences persist');
select has_column('public', 'career_profiles', 'domains', 'domain preferences persist');
select has_column('public', 'career_profiles', 'keywords', 'profile keywords persist');
select has_function(
  'public', 'save_career_profile_draft', array['jsonb'],
  'the owner-derived profile save exists'
);
select has_function(
  'public', 'save_search_profile', array['jsonb'],
  'the owner-derived named search save exists'
);
select has_function(
  'public', 'delete_current_cv', array['uuid', 'text'],
  'race-safe current CV deletion exists'
);
select has_function(
  'public', 'delete_career_profile_data', array[]::text[],
  'owner-derived profile deletion exists'
);
select ok(
  not has_function_privilege('anon', 'public.save_career_profile_draft(jsonb)', 'EXECUTE'),
  'anonymous callers cannot save profile drafts'
);
select ok(
  has_function_privilege('authenticated', 'public.save_career_profile_draft(jsonb)', 'EXECUTE'),
  'authenticated owners can save profile drafts'
);
select ok(
  not has_function_privilege('anon', 'public.save_search_profile(jsonb)', 'EXECUTE'),
  'anonymous callers cannot save named searches'
);
select ok(
  not has_function_privilege('anon', 'public.delete_current_cv(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot delete CV metadata'
);
select ok(
  not has_function_privilege('anon', 'public.delete_career_profile_data()', 'EXECUTE'),
  'anonymous callers cannot delete profile data'
);
select throws_ok(
  $$ select public.save_career_profile_draft('{}'::jsonb) $$,
  '42501',
  null,
  'profile save requires an authenticated approved actor'
);

select * from finish();
rollback;

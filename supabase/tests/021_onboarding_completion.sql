begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_function(
  'public', 'finish_onboarding',
  array['bigint', 'jsonb', 'boolean', 'boolean'],
  'onboarding completion is one transactional RPC'
);
select is_definer(
  'public', 'finish_onboarding',
  array['bigint', 'jsonb', 'boolean', 'boolean'],
  'completion runs as security definer so it can reach the fenced writes'
);
select function_returns(
  'public', 'finish_onboarding',
  array['bigint', 'jsonb', 'boolean', 'boolean'], 'uuid',
  'completion returns the saved search identifier'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.finish_onboarding(bigint, jsonb, boolean, boolean)',
    'EXECUTE'
  ),
  'anonymous callers cannot finish onboarding'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.finish_onboarding(bigint, jsonb, boolean, boolean)',
    'EXECUTE'
  ),
  'approved signed-in users finish their own onboarding'
);

-- The wrapper adds a transaction, not an exemption: an unauthenticated caller
-- is refused before any of the four writes is attempted.
select throws_ok(
  $$ select public.finish_onboarding(1::bigint, '{}'::jsonb, false, false) $$,
  '42501',
  null,
  'completion still requires approved access'
);

select * from finish();

rollback;

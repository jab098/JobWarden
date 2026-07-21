begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

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

-- Going back a step. Requested by an owner who could not return to step 1 to
-- replace the CV they had given there.
select has_function(
  'public', 'revisit_onboarding_step', array['text'],
  'returning to an earlier step is one RPC'
);
select is_definer(
  'public', 'revisit_onboarding_step', array['text'],
  'it runs as security definer, like advancing does'
);
select ok(
  not has_function_privilege(
    'anon', 'public.revisit_onboarding_step(text)', 'EXECUTE'
  ),
  'anonymous callers cannot rewind somebody else''s onboarding'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.revisit_onboarding_step(text)', 'EXECUTE'
  ),
  'approved signed-in users can return to their own earlier step'
);

-- This file had no fixtures at all — every assertion above is about shape and
-- privilege. The behavioural half below needs a real approved identity.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '97000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'onboarding-back@example.test', '',
  now(), '{"provider":"email","providers":["email"]}',
  '{"full_name":"Onboarding fixture"}', now(), now()
);

-- `handle_new_user` files the request as pending; onboarding needs it approved.
update public.access_requests
set status = 'approved', decided_at = now(), decision_reason = 'Fixture'
where user_id = '97000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true
);

select lives_ok(
  $$ select public.advance_onboarding('cv', 'cv', 'thin') $$,
  'a first step is recorded'
);
select lives_ok(
  $$ select public.advance_onboarding('cv', 'confirm_evidence', null) $$,
  'a second step is recorded'
);

-- The property the surface depends on: removing the step moves the reader
-- back to it, because `next_onboarding_step` reads the earliest gap.
select lives_ok(
  $$ select public.revisit_onboarding_step('confirm_evidence') $$,
  'a completed step can be returned to'
);
select is(
  (
    select array_length(completed_steps, 1)
    from public.career_onboarding_state
    where owner_id = '97000000-0000-4000-8000-000000000001'
  ),
  1,
  'returning to a step un-completes exactly that one'
);

-- A step nobody answered cannot be "returned to". Silently succeeding would be
-- a control that appears to work and changes nothing.
select throws_ok(
  $$ select public.revisit_onboarding_step('notifications') $$,
  '22023',
  'step has not been completed',
  'a step that was never answered cannot be returned to'
);

select throws_ok(
  $$ select public.revisit_onboarding_step('aspirations') $$,
  '22023',
  'step not part of this path',
  'a step from the other path cannot be returned to'
);

reset role;

select * from finish();

rollback;

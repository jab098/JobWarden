begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_column(
  'public', 'career_onboarding_state', 'answers',
  'partial onboarding answers are persisted between visits'
);
select col_not_null(
  'public', 'career_onboarding_state', 'answers',
  'answers always hold at least an empty object'
);
select col_default_is(
  'public', 'career_onboarding_state', 'answers', '{}'::jsonb,
  'a new state starts with nothing answered'
);

select has_function(
  'public', 'save_onboarding_answers', array['jsonb'],
  'the owner-fenced answer merge RPC exists'
);
select is_definer(
  'public', 'save_onboarding_answers', array['jsonb'],
  'answer merges run as security definer'
);
select ok(
  not has_function_privilege(
    'anon', 'public.save_onboarding_answers(jsonb)', 'EXECUTE'
  ),
  'anonymous callers cannot write onboarding answers'
);

select throws_ok(
  $$ insert into public.career_onboarding_state (owner_id, answers)
     values ('00000000-0000-4000-8000-000000000001', '"answers"'::jsonb) $$,
  '23514',
  null,
  'answers must be an object, not a scalar'
);

select * from finish();

rollback;

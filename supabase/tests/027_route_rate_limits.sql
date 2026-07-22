begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_function(
  'public', 'consume_rate_limit', array['text', 'integer', 'integer'],
  'the per-user rate-limit RPC exists'
);
select ok(
  not has_function_privilege(
    'anon', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'
  ),
  'anonymous callers cannot consume a rate limit'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.consume_rate_limit(text,integer,integer)', 'EXECUTE'
  ),
  'authenticated callers can consume a rate limit'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '95000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'rate-limit-owner@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ select public.consume_rate_limit('export', 0, 60) $$,
  '22023',
  null,
  'a non-positive limit is rejected'
);
select is(
  public.consume_rate_limit('export', 3, 60),
  true,
  'the first request in the window is within a limit of three'
);
select is(
  public.consume_rate_limit('export', 3, 60),
  true,
  'the second request is within the limit'
);
-- Third request (uncounted) reaches the ceiling; the fourth exceeds it.
select public.consume_rate_limit('export', 3, 60);
select is(
  public.consume_rate_limit('export', 3, 60),
  false,
  'the fourth request in the window is refused'
);

select * from finish();
rollback;

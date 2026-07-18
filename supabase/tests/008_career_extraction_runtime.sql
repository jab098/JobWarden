begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table(
  'public',
  'career_ai_daily_usage',
  'career AI attempts have an auditable daily counter'
);
select is(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'career_ai_daily_usage'
  ),
  true,
  'the career AI usage counter enables and forces RLS'
);
select has_function(
  'public',
  'claim_career_profile_extraction',
  array['uuid', 'uuid', 'text'],
  'the service extraction claim exists'
);
select has_function(
  'public',
  'renew_career_profile_extraction_lease',
  array['uuid', 'uuid'],
  'the service extraction lease renewal exists'
);
select has_function(
  'public',
  'complete_career_profile_extraction',
  array['uuid', 'uuid', 'text', 'jsonb', 'text', 'integer', 'integer', 'integer'],
  'the token-fenced service-only extraction completion exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_career_profile_extraction(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot claim a career extraction'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_career_profile_extraction(uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot invoke the service claim'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.renew_career_profile_extraction_lease(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot renew an extraction lease'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_career_profile_extraction(uuid,uuid,text,jsonb,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'authenticated callers cannot complete extraction runs directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_career_profile_extraction(uuid,uuid,text)',
    'EXECUTE'
  ),
  'the service runtime receives the claim grant'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.renew_career_profile_extraction_lease(uuid,uuid)',
    'EXECUTE'
  ),
  'the service runtime receives the renewal grant'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_career_profile_extraction(uuid,uuid,text,jsonb,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'the service runtime receives the completion grant'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.career_ai_daily_usage',
    'SELECT'
  ),
  'users cannot inspect or alter AI accounting rows'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.career_ai_daily_usage',
    'INSERT'
  ),
  'the service role can operate the AI accounting boundary'
);

set local role anon;
select throws_ok(
  $$
    select * from public.claim_career_profile_extraction(
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      repeat('a', 64)
    )
  $$,
  '42501',
  null,
  'an unauthenticated actor cannot claim any document'
);
reset role;

select throws_ok(
  $$
    select public.complete_career_profile_extraction(
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'failed',
      null,
      'internal_error',
      0,
      0,
      0
    )
  $$,
  '42501',
  null,
  'completion rejects non-service execution even for privileged sessions'
);

select * from finish();
rollback;

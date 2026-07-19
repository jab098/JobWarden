begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_function(
  'public', 'list_audit_log', array['integer', 'timestamptz'],
  'the audit log read exists'
);
select has_function(
  'public', 'admin_operational_health', array['integer', 'integer'],
  'the operational health read exists'
);
select is_definer(
  'public', 'list_audit_log', array['integer', 'timestamptz'],
  'the audit read runs as security definer'
);
select is_definer(
  'public', 'admin_operational_health', array['integer', 'integer'],
  'the health read runs as security definer'
);

select ok(
  not has_function_privilege(
    'anon', 'public.list_audit_log(integer, timestamptz)', 'EXECUTE'
  ),
  'anonymous callers cannot read the audit log'
);
select ok(
  not has_function_privilege(
    'anon', 'public.admin_operational_health(integer, integer)', 'EXECUTE'
  ),
  'anonymous callers cannot read operational health'
);

-- Granted to authenticated, but every call re-checks administrator status, so a
-- signed-in non-administrator is refused by the function rather than the grant.
select throws_ok(
  $$ select public.list_audit_log(50, null) $$,
  '42501',
  null,
  'a caller without administrator access is refused the audit log'
);
select throws_ok(
  $$ select public.admin_operational_health(80, 2500) $$,
  '42501',
  null,
  'a caller without administrator access is refused health figures'
);

select throws_ok(
  $$ select public.list_audit_log(5000, null) $$,
  '42501',
  null,
  'access is checked before the page size, so the bound cannot be probed'
);

select * from finish();

rollback;

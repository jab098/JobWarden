begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- Task 29. Administrator-only operations over the early-access list.
--
-- The property these assertions exist for is that **nobody but an
-- administrator can learn whether an address is on the list**. That is checked
-- three ways here: the table refuses direct access, the reads refuse a
-- non-administrator, and the invite function takes a `uuid` rather than an
-- email so the question cannot be asked of it at all.

select has_function(
  'public', 'list_early_access_signups', array['integer', 'timestamptz'],
  'the pending-queue read exists'
);
select has_function(
  'public', 'count_early_access_pending', array[]::text[],
  'the pending count exists'
);
select has_function(
  'public', 'mark_early_access_invited', array['uuid'],
  'the invite mark exists'
);
select is_definer(
  'public', 'list_early_access_signups', array['integer', 'timestamptz'],
  'the queue read runs as security definer'
);
select is_definer(
  'public', 'mark_early_access_invited', array['uuid'],
  'the invite mark runs as security definer'
);

-- The invite mark takes a uuid. If it ever took an email, an enumeration
-- oracle would exist for anyone who got past the administrator gate by any
-- means, so the signature itself is worth pinning.
select is(
  (
    select pg_catalog.pg_get_function_identity_arguments(p.oid)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mark_early_access_invited'
  ),
  'target_id uuid',
  'the invite mark is keyed on the row id, never on an email'
);

select ok(
  not has_function_privilege(
    'anon', 'public.list_early_access_signups(integer, timestamptz)', 'EXECUTE'
  ),
  'anonymous callers cannot read the early-access queue'
);
select ok(
  not has_function_privilege(
    'anon', 'public.mark_early_access_invited(uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot mark somebody invited'
);
select ok(
  not has_table_privilege('anon', 'public.early_access_signups', 'SELECT'),
  'anonymous callers cannot read the list directly'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.early_access_signups', 'SELECT'
  ),
  'signed-in callers cannot read the list directly either'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('96000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ea-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Fixture admin"}', now(), now()),
  ('96000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ea-member@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Fixture member"}', now(), now());

insert into public.user_roles (user_id, role, created_by)
values (
  '96000000-0000-4000-8000-000000000001',
  'admin',
  '96000000-0000-4000-8000-000000000001'
);

-- Two fictional signups, deliberately out of insertion order by date so the
-- oldest-first guarantee is tested rather than coincidentally satisfied.
insert into public.early_access_signups (id, email, name, hoping_for, created_at)
values
  ('96000000-0000-4000-8000-0000000000bb', 'newer@example.test', 'Newer Person', 'A role in Leeds', now() - interval '1 day'),
  ('96000000-0000-4000-8000-0000000000aa', 'older@example.test', 'Older Person', '<script>not markup</script>', now() - interval '9 days');

-- A signed-in non-administrator is refused by the function, not by the grant.
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$ select public.list_early_access_signups(50, null) $$,
  '42501',
  'administrator access required',
  'a signed-in non-administrator cannot read the queue'
);
select throws_ok(
  $$ select public.count_early_access_pending() $$,
  '42501',
  'administrator access required',
  'a signed-in non-administrator cannot count the queue'
);
select throws_ok(
  $$ select public.mark_early_access_invited('96000000-0000-4000-8000-0000000000aa') $$,
  '42501',
  'administrator access required',
  'a signed-in non-administrator cannot mark somebody invited'
);

select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);

-- Oldest first: the person who has waited longest is the one to invite next.
select is(
  (select email from public.list_early_access_signups(50, null) limit 1),
  'older@example.test',
  'the queue is ordered oldest first'
);

-- The free-text field is returned exactly as stored. Escaping belongs at the
-- surface that renders it, and this asserts the database does not quietly
-- mangle it on the way out.
select is(
  (
    select signup.hoping_for
    from public.list_early_access_signups(50, null) as signup
    where signup.email = 'older@example.test'
  ),
  '<script>not markup</script>',
  'free text is returned as stored, for the surface to render as text'
);

select is(
  public.count_early_access_pending(), 2, 'both signups are pending'
);

select is(
  public.mark_early_access_invited('96000000-0000-4000-8000-0000000000aa'),
  true,
  'marking a pending signup invited reports that it changed'
);

-- Idempotent: a second click changes nothing and reports so, rather than
-- raising or writing a duplicate audit entry.
select is(
  public.mark_early_access_invited('96000000-0000-4000-8000-0000000000aa'),
  false,
  'marking the same signup again changes nothing'
);

-- An id that does not exist is answered the same way as one already invited,
-- so a caller learns nothing from the difference.
select is(
  public.mark_early_access_invited('96000000-0000-4000-8000-00000000ffff'),
  false,
  'an unknown id is answered exactly as an already-invited one is'
);

select is(
  public.count_early_access_pending(), 1, 'the invited signup leaves the queue'
);

-- Auditable, and the audit entry carries the row id rather than the email: a
-- stranger's address must not land in a log that is never erased.
select is(
  (
    select count(*)::int from public.audit_log
    where action = 'early_access.invited'
      and resource_id = '96000000-0000-4000-8000-0000000000aa'
  ),
  1,
  'exactly one audit entry records the invitation'
);
select is(
  (
    select count(*)::int from public.audit_log
    where action = 'early_access.invited'
      and metadata::text like '%older@example.test%'
  ),
  0,
  'the audit entry does not carry the email address'
);

-- The positive grant, which nothing asserted. Dropping `grant execute ... to
-- authenticated` left all 22 assertions green while `/admin/early-access` broke
-- in production, because every other assertion here is a negative one.
select ok(
  has_function_privilege(
    'authenticated', 'public.list_early_access_signups(integer, timestamptz)',
    'EXECUTE'
  ),
  'signed-in callers can reach the queue read, which the administrator gate then judges'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.mark_early_access_invited(uuid)', 'EXECUTE'
  ),
  'signed-in callers can reach the invite mark, which the administrator gate then judges'
);
select ok(
  not has_function_privilege(
    'anon', 'public.count_early_access_pending()', 'EXECUTE'
  ),
  'anonymous callers cannot count the queue'
);

-- The public join path is anonymous by design, so a second submission for an
-- address already on the list must not let a stranger rewrite what the first
-- person said. Found by independent review: `coalesce(excluded.x, stored.x)`
-- let the incoming value win, and `created_at` was preserved, so attacker text
-- kept the real person's place at the front of the queue.
set local role anon;
select public.join_early_access(
  'first@example.test', 'Real Person', 'What I actually wrote', 'friend'
);
select public.join_early_access(
  'first@example.test', 'Overwriter', 'Replacement text', 'other'
);
reset role;

select is(
  (select name from public.early_access_signups where email = 'first@example.test'),
  'Real Person',
  'a later submission cannot replace a name already on the list'
);
select is(
  (select hoping_for from public.early_access_signups where email = 'first@example.test'),
  'What I actually wrote',
  'a later submission cannot replace free text already on the list'
);

-- The documented intent survives: a later submission still fills a blank.
set local role anon;
select public.join_early_access('second@example.test', null, null, null);
select public.join_early_access(
  'second@example.test', 'Filled In Later', 'Added later', 'search'
);
reset role;

select is(
  (select name || ' | ' || hoping_for from public.early_access_signups
   where email = 'second@example.test'),
  'Filled In Later | Added later',
  'a later submission still fills details the first one left blank'
);

select * from finish();

rollback;

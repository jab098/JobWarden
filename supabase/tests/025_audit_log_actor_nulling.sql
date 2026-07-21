begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- The audit foreign key's own nulling action, and the append-only rule that
-- refused it until migration 202607220006.
--
-- `audit_log.actor_user_id` is `on delete set null`, so deleting an account
-- should leave the audit record standing but unattributed. The append-only
-- trigger raised on every update, including that one, and because
-- `handle_new_user` writes an `access.requested` row for every account at
-- signup, the result was that no `auth.users` row could be deleted at all.
--
-- These assertions pin both halves: the one transition that is now permitted,
-- and every neighbouring transition that must still raise. The neighbours are
-- the point — a fix that permitted any update would satisfy the first test on
-- its own while destroying the property the trigger exists for.

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('95000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nulling-one@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nulling fixture one"}', now(), now()),
  ('95000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nulling-two@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nulling fixture two"}', now(), now());

-- `handle_new_user` has already written an `access.requested` row for each of
-- these accounts, which is precisely why the delete used to fail. One extra row
-- with known contents is added so the non-actor columns can be asserted
-- unchanged after the nulling.
insert into public.audit_log (id, actor_user_id, action, resource_type, resource_id, metadata)
values (
  '95000000-0000-4000-8000-0000000000aa',
  '95000000-0000-4000-8000-000000000001',
  'access.approved',
  'access_request',
  'fixture-resource',
  '{"note":"unchanged"}'::jsonb
);

-- 1. The defect itself. This delete raised `audit_log is append-only` before
--    the fix, because the foreign key's nulling action hit the trigger.
select lives_ok(
  $$ delete from auth.users where id = '95000000-0000-4000-8000-000000000001' $$,
  'an account with audit rows can be deleted'
);

-- 2. The audit record survives the deletion rather than being cascaded away.
select is(
  (select count(*)::int from public.audit_log
   where id = '95000000-0000-4000-8000-0000000000aa'),
  1,
  'the audit record survives the account deletion'
);

-- 3. And it is left unattributed, which is what `on delete set null` asks for.
select is(
  (select actor_user_id from public.audit_log
   where id = '95000000-0000-4000-8000-0000000000aa'),
  null::uuid,
  'the surviving audit record is unattributed'
);

-- 4. Every other column is untouched by the nulling.
select is(
  (select action || '|' || resource_type || '|' || coalesce(resource_id, '') || '|' || metadata::text
   from public.audit_log where id = '95000000-0000-4000-8000-0000000000aa'),
  'access.approved|access_request|fixture-resource|{"note": "unchanged"}',
  'the nulling changes no other column'
);

-- 5. Deleting an audit row is still refused. This is the property the
--    append-only rule exists for and the narrowing must not have cost it.
select throws_ok(
  $$ delete from public.audit_log where id = '95000000-0000-4000-8000-0000000000aa' $$,
  '42501',
  'audit_log is append-only',
  'an audit row still cannot be deleted'
);

-- 6. Rewriting the action is still refused.
select throws_ok(
  $$ update public.audit_log set action = 'access.revoked'
     where id = '95000000-0000-4000-8000-0000000000aa' $$,
  '42501',
  'audit_log is append-only',
  'an audit action still cannot be rewritten'
);

-- 7. Restoring an actor to a nulled row is still refused. The permitted
--    transition is one-way; re-attribution is not the foreign key's action.
select throws_ok(
  $$ update public.audit_log
     set actor_user_id = '95000000-0000-4000-8000-000000000002'
     where id = '95000000-0000-4000-8000-0000000000aa' $$,
  '42501',
  'audit_log is append-only',
  'a nulled audit row cannot be re-attributed'
);

-- 8. Re-attributing one live actor to another is still refused.
select throws_ok(
  $$ update public.audit_log
     set actor_user_id = '95000000-0000-4000-8000-000000000002'
     where actor_user_id is not null
       and action = 'access.requested' $$,
  '42501',
  'audit_log is append-only',
  'an audit row cannot be moved to a different actor'
);

-- 9. The column-exact guard. Nulling the actor while smuggling another column
--    change through in the same statement is refused. Without the whole-row
--    comparison this would succeed, which is the hole a hand-written column
--    list would eventually leave.
select throws_ok(
  $$ update public.audit_log
     set actor_user_id = null, action = 'access.revoked'
     where actor_user_id = '95000000-0000-4000-8000-000000000002' $$,
  '42501',
  'audit_log is append-only',
  'nulling the actor cannot smuggle another column change with it'
);

select * from finish();

rollback;

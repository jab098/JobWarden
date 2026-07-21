-- Permit the actor foreign key's own nulling action, and nothing else.
--
-- `public.audit_log.actor_user_id` is declared `references auth.users (id) on
-- delete set null`, so deleting an account asks PostgreSQL to null that column
-- and leave the audit record standing but unattributed. That is a deliberate
-- design decision, and `audit_log_append_only` defeated it: the trigger fires
-- `before update or delete` and raised unconditionally, so the foreign key's
-- own action was refused.
--
-- Because `private.handle_new_user` writes an `access.requested` row for every
-- account at signup, every account had at least one referencing row, and so
-- **no `auth.users` row could ever be deleted**. A compromised, duplicate or
-- test account could not be removed, and identity-level erasure would fail.
-- This was recorded as a known defect in `docs/project-status.md` from Task 35
-- until now, and `supabase/tests/011_career_profile_concurrency.sql` carried a
-- teardown workaround for it.
--
-- The exception below is deliberately the narrowest one that resolves the
-- contradiction:
--
--   * only on `update`, never on `delete` — an audit row can still never be
--     removed, which is the property the append-only rule exists to protect;
--   * only `actor_user_id` moving from non-null to null, which is exactly and
--     only what `on delete set null` performs — re-attributing a row to a
--     different actor, or restoring an actor to a nulled row, both still raise;
--   * only when every other column is byte-identical. `to_jsonb(row) - key`
--     compares the whole remaining row rather than a hand-written column list,
--     so a column added to this table in future is covered automatically. A
--     hand-listed comparison would silently stop protecting new columns, which
--     is the failure mode this shape exists to avoid.
--
-- Narrowing this trigger is a smaller change to the security posture than it
-- looks, because the trigger is defence in depth rather than the barrier.
-- `public.audit_log` has forced RLS with a select-only policy and no write
-- policy at all, and `revoke all on all tables in schema public` in
-- `202607170001_foundation.sql` leaves `authenticated` with `select` alone. The
-- only callers that reach this trigger are `security definer` functions owned
-- by `postgres`, all of which are written and reviewed in this repository.
--
-- `create or replace`, never `drop` and recreate: a drop resets the ACL to
-- `execute` for `public`. The trigger itself is unchanged and still bound to
-- this function.
create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nested rather than a single chained condition. `new` is unassigned in a
  -- delete trigger, and PL/pgSQL evaluates a boolean expression as one SQL
  -- expression without a guaranteed left-to-right short circuit, so a chained
  -- `tg_op = 'UPDATE' and new.actor_user_id is null` could still evaluate
  -- `new` on a delete and raise the wrong error.
  if tg_op = 'UPDATE' then
    if old.actor_user_id is not null
      and new.actor_user_id is null
      and to_jsonb(new) - 'actor_user_id' = to_jsonb(old) - 'actor_user_id'
    then
      return new;
    end if;
  end if;

  raise exception using
    errcode = '42501',
    message = 'audit_log is append-only';
end;
$$;

revoke all on function private.prevent_audit_log_mutation()
  from public, anon, authenticated, service_role;

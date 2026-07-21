begin;

-- Task 29. The early-access list has shipped in the landing dialog since Task
-- 26b with no way to read it; the owner has been reading it with SQL. These are
-- two administrator-only functions over rows that already exist. Nothing new is
-- collected.
--
-- Both are `security definer` because `early_access_signups` revokes all from
-- `public`, `anon` and `authenticated` — these functions and
-- `join_early_access` are the only paths to the table, which is what keeps the
-- list unreadable to everyone else.

-- The pending queue, oldest first, because the person who has waited longest is
-- the one to invite next.
--
-- Deliberately returns only rows that have not been invited. An administrator
-- needs the queue, and an all-time export of everyone who ever gave an address
-- is a larger disclosure than the task calls for.
create or replace function public.list_early_access_signups(
  max_entries integer,
  after_created_at timestamptz
)
returns table (
  id uuid,
  email text,
  name text,
  hoping_for text,
  heard_from text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;
  if max_entries is null or max_entries < 1 or max_entries > 200 then
    raise exception using errcode = '22023', message = 'invalid page size';
  end if;

  return query
  select
    signup.id,
    signup.email,
    signup.name,
    -- Returned as stored. It is free text a stranger wrote, so the surface
    -- renders it as text and never as markup; the database does not attempt to
    -- sanitise it, because escaping belongs at the boundary that renders it.
    signup.hoping_for,
    signup.heard_from,
    signup.created_at
  from public.early_access_signups as signup
  where signup.invited_at is null
    and (after_created_at is null or signup.created_at > after_created_at)
  order by signup.created_at asc, signup.id asc
  limit max_entries;
end;
$$;

revoke all on function public.list_early_access_signups(integer, timestamptz)
  from public, anon;
grant execute on function public.list_early_access_signups(integer, timestamptz)
  to authenticated;

-- How many are still waiting. Separate from the page so the surface can say
-- "showing 50 of 214" without reading every row.
create or replace function public.count_early_access_pending()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pending integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;

  select count(*)::integer into pending
  from public.early_access_signups
  where invited_at is null;

  return pending;
end;
$$;

revoke all on function public.count_early_access_pending() from public, anon;
grant execute on function public.count_early_access_pending() to authenticated;

/*
 * Marking somebody invited.
 *
 * Takes the row's `id`, never an email. That is the structural reason the
 * enumeration property holds: there is no argument a caller could supply to
 * ask "is this address on the list?", so the question cannot be put to this
 * function at all, let alone answered. The administrator gate is the second
 * barrier rather than the only one.
 *
 * Idempotent. Marking a row that is already invited changes nothing and writes
 * no audit entry, so a double submission cannot fill the log with duplicate
 * claims about the same decision. The return value says which happened.
 *
 * The audit entry records the row id and never the email. The id identifies the
 * decision completely, and an address in the audit log would put a stranger's
 * personal data somewhere it is never erased.
 */
create or replace function public.mark_early_access_invited(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  updated_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;
  if target_id is null then
    raise exception using errcode = '22023', message = 'invalid signup';
  end if;

  update public.early_access_signups
  set invited_at = now()
  where id = target_id
    and invited_at is null
  returning id into updated_id;

  if updated_id is null then
    -- Either the row does not exist or it was already invited. Both are
    -- reported the same way and neither raises, so a repeated click is quiet
    -- and the caller learns nothing it did not already have.
    return false;
  end if;

  insert into public.audit_log (
    actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    actor_id,
    'early_access.invited',
    'early_access_signup',
    updated_id::text,
    '{}'::jsonb
  );

  return true;
end;
$$;

revoke all on function public.mark_early_access_invited(uuid) from public, anon;
grant execute on function public.mark_early_access_invited(uuid) to authenticated;

commit;

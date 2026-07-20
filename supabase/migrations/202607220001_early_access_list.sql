begin;

-- The early-access list. Distinct from `access_requests`, which is keyed on a
-- real `auth.users` row and can only exist once somebody has signed in: this is
-- for people who have not got that far, and who only ever give an email.
--
-- Nothing here is product data, so it never joins to a user. It is a queue the
-- owner reads when deciding who to invite next.
create table public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    char_length(email) between 3 and 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  name text check (name is null or char_length(name) between 1 and 120),
  -- Free text the visitor wrote about what they want help with. Bounded, and
  -- never rendered as anything but text.
  hoping_for text check (
    hoping_for is null or char_length(hoping_for) between 1 and 1000
  ),
  heard_from text check (
    heard_from is null
    or heard_from in (
      'search', 'social', 'friend', 'community', 'newsletter', 'other'
    )
  ),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  -- One row per address. A second submission updates the first rather than
  -- queueing the same person twice.
  constraint early_access_signups_email_unique unique (email)
);

alter table public.early_access_signups enable row level security;
alter table public.early_access_signups force row level security;

-- No direct access for anyone. The public route inserts through the function
-- below, which is the only writer; administrators read through the admin
-- surface, which runs as service_role.
revoke all on public.early_access_signups from public, anon, authenticated;
grant all on public.early_access_signups to service_role;

create index early_access_signups_queue_idx
  on public.early_access_signups (created_at desc)
  where invited_at is null;

/*
 * Joining the list. Reachable without a session because the whole point is
 * that the visitor has no account yet.
 *
 * It returns nothing and raises nothing on a duplicate, so the endpoint cannot
 * be used to find out whether an address is already on the list. That matters:
 * an unauthenticated writer that reports "already registered" is an email
 * enumeration oracle.
 */
create or replace function public.join_early_access(
  target_email text,
  target_name text,
  target_hoping_for text,
  target_heard_from text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalised_email text := lower(btrim(target_email));
  clean_name text := nullif(btrim(coalesce(target_name, '')), '');
  clean_hoping text := nullif(btrim(coalesce(target_hoping_for, '')), '');
  clean_heard text := nullif(btrim(coalesce(target_heard_from, '')), '');
begin
  if normalised_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(normalised_email) > 320 then
    raise exception using errcode = '22023', message = 'invalid email';
  end if;
  if clean_name is not null and char_length(clean_name) > 120 then
    clean_name := left(clean_name, 120);
  end if;
  if clean_hoping is not null and char_length(clean_hoping) > 1000 then
    clean_hoping := left(clean_hoping, 1000);
  end if;
  if clean_heard is not null and clean_heard not in (
    'search', 'social', 'friend', 'community', 'newsletter', 'other'
  ) then
    clean_heard := 'other';
  end if;

  insert into public.early_access_signups (
    email, name, hoping_for, heard_from
  )
  values (normalised_email, clean_name, clean_hoping, clean_heard)
  on conflict (email) do update
  set name = coalesce(excluded.name, public.early_access_signups.name),
      hoping_for = coalesce(
        excluded.hoping_for, public.early_access_signups.hoping_for
      ),
      heard_from = coalesce(
        excluded.heard_from, public.early_access_signups.heard_from
      );
end;
$$;

revoke all on function public.join_early_access(text, text, text, text)
  from public;
grant execute on function public.join_early_access(text, text, text, text)
  to anon, authenticated;

commit;

begin;

-- Found by the independent review of Task 29, 2026-07-21, and confirmed by
-- running it as `anon`: a second submission for an address already on the list
-- **overwrote** that row's name and free text.
--
-- `on conflict (email) do update set name = coalesce(excluded.name, ...)` puts
-- the incoming value first, so it wins whenever it is non-null. Turnstile gates
-- bots rather than identity and there is no address confirmation, so anybody
-- could put text of their choosing in front of an administrator attributed to
-- a real person's address — and `created_at` is preserved, so it kept that
-- person's place at the front of the queue.
--
-- Reversing the `coalesce` keeps the documented intent — "a second submission
-- updates the first rather than queueing the same person twice" — for the case
-- it was written for, filling in details the first submission left blank, while
-- refusing to replace anything already there. First writer wins per field.
--
-- The function still returns void and still raises nothing on a conflict, so it
-- remains no kind of enumeration oracle. That property is unchanged and is why
-- the fix is here rather than in a rejection.
--
-- `create or replace`, same signature, so the existing grants stand.
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
  -- The stored value first: a later submission fills blanks, never replaces.
  set name = coalesce(public.early_access_signups.name, excluded.name),
      hoping_for = coalesce(
        public.early_access_signups.hoping_for, excluded.hoping_for
      ),
      heard_from = coalesce(
        public.early_access_signups.heard_from, excluded.heard_from
      );
end;
$$;

commit;

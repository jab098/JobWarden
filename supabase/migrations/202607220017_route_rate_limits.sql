begin;

-- S2 — per-user rate limit for expensive route handlers.
--
-- Most mutations are cheap and RLS-scoped to the caller's own rows, and the
-- costly ingestion/AI paths already have ceilings (the AI daily allowance and
-- per-user concurrency, and S4's CV upload rate limit). What has no limit is the
-- two GET routes that *regenerate content on every request*: the data export
-- rebuilds the whole JSON bundle, and the CV tailoring download re-renders a
-- DOCX from the stored original. A stolen or shared session could spin either in
-- a loop and burn serverless CPU. This adds a fixed-window per-user counter and
-- a definer RPC those routes consume; the cheap self-scoped actions are left
-- alone deliberately rather than wrapped in a limiter they do not need.
--
-- The counter lives in `private` (revoked from every client role in the
-- foundation), so it is never exposed through PostgREST and needs no RLS.

create table private.rate_limit_counters (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

revoke all on private.rate_limit_counters
  from public, anon, authenticated, service_role;

-- Returns true when the caller is within the limit for this window, false when
-- it has been exceeded. The row for the current window is upserted atomically,
-- and prior windows for the same caller/bucket are cleared so the table holds at
-- most one row per caller per bucket.
create or replace function public.consume_rate_limit(
  bucket_name text,
  max_per_window integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_window timestamptz;
  new_count integer;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if window_seconds < 1 or max_per_window < 1 then
    raise exception using errcode = '22023', message = 'invalid rate limit';
  end if;

  -- date_part, not the EXTRACT(field FROM source) construct: that special
  -- syntax cannot be schema-qualified, which `set search_path = ''` requires.
  current_window := pg_catalog.to_timestamp(
    pg_catalog.floor(
      pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) / window_seconds
    ) * window_seconds
  );

  delete from private.rate_limit_counters as prior
  where prior.user_id = actor_user_id
    and prior.bucket = bucket_name
    and prior.window_start < current_window;

  insert into private.rate_limit_counters (user_id, bucket, window_start, count)
  values (actor_user_id, bucket_name, current_window, 1)
  on conflict (user_id, bucket, window_start) do update
    set count = private.rate_limit_counters.count + 1
  returning count into new_count;

  return new_count <= max_per_window;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to authenticated;

commit;

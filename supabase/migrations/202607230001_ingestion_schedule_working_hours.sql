-- Widen the ingestion schedule to early-working-hours and afternoon cadence.
--
-- The owner asked for refreshes when employers actually post — across the early
-- working day and the afternoon: 08:00, 09:00, 10:00, 12:00, 15:00 and 17:00
-- Europe/London on weekdays, replacing the previous 09:00, 12:00, 15:00, 18:00.
-- New adverts land during the working day, not late evening, so the schedule
-- sits there. Per-source `minimum_sync_interval` still governs how often any one
-- source re-ingests (a 6h national source still runs ~twice, a 2h board more
-- often); this only widens when a refresh is *attempted*.
--
-- The two-layer design from 202607180002 is retained and is exactly what makes
-- this DST-safe: pg_cron fires in UTC, so the cron lists every UTC hour that
-- maps to a wanted London hour under either offset (GMT and BST), and the
-- function's own Europe/London hour gate selects the six local hours. Editing
-- 202607180002 in place would never re-run in production — Supabase tracks
-- applied migrations by version — so the reschedule and the gate change land
-- here, as a new migration, and take effect on the next `db push`.
--
-- create-or-replace, never drop: a drop resets the function ACL to EXECUTE for
-- PUBLIC. The prior revokes survive a replace, so the private helper stays
-- callable only by the cron owner.

create or replace function private.invoke_jobwarden_ingestion()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  london_time timestamp := clock_timestamp() at time zone 'Europe/London';
  project_url text;
  cron_secret text;
  request_id bigint;
begin
  if extract(isodow from london_time) not between 1 and 5
    or extract(hour from london_time) not in (8, 9, 10, 12, 15, 17) then
    return null;
  end if;

  select decrypted_secret
  into project_url
  from vault.decrypted_secrets
  where name = 'jobwarden_project_url';

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'jobwarden_ingestion_cron_secret';

  if project_url is null
    or project_url !~ '^https://[a-z0-9-]+\.supabase\.co$'
    or cron_secret is null
    or char_length(cron_secret) < 32 then
    raise exception using errcode = '22023', message = 'ingestion scheduler secrets unavailable';
  end if;

  select net.http_post(
    url := project_url || '/functions/v1/ingest-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_jobwarden_ingestion() from public, anon, authenticated, service_role;

-- Reschedule the existing named job in place. cron.schedule upserts by name, so
-- this replaces the schedule rather than adding a second job. The UTC hour list
-- is every hour that is one of the six wanted London hours under BST (UTC+1) or
-- GMT (UTC+0); the function's London-hour gate above discards the offset that is
-- not in effect, so exactly the six local hours fire, once each:
--   L08 → 07/08   L09 → 08/09   L10 → 09/10   L12 → 11/12   L15 → 14/15   L17 → 16/17
select cron.schedule(
  'jobwarden-ingestion-weekdays',
  '0 7,8,9,10,11,12,14,15,16,17 * * 1-5',
  'select private.invoke_jobwarden_ingestion()'
);

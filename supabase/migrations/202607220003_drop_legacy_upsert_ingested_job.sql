-- Drops the singular `upsert_ingested_job`, superseded by the plural
-- `upsert_ingested_jobs` since Task 9.
--
-- It was dead, broken, and still granted. Task 9 added `jobs.deduplication_key`
-- as `not null` and taught the plural function to supply it; the singular one
-- was never updated, so every call raised
--
--   null value in column "deduplication_key" of relation "jobs"
--
-- No product code reached it — the ingestion Edge Function calls the plural
-- through `upsert_ingested_jobs` — but `execute` remained granted to
-- `service_role`, leaving a callable entry point that could only ever fail.
-- The live database gate found it because `supabase/tests/003_ingestion.sql`
-- was the one remaining caller; that file now exercises the plural instead.
--
-- Dropping rather than repairing it: reviving an entry point nothing calls
-- would leave two functions that have to agree about canonical identity
-- forever, and the plural already owns that.

revoke all on function public.upsert_ingested_job(
  uuid, text, text, text, text, text, text, text[], text, text, text, text,
  text, integer, integer, text, text, timestamptz, timestamptz, text
) from service_role;

drop function if exists public.upsert_ingested_job(
  uuid, text, text, text, text, text, text, text[], text, text, text, text,
  text, integer, integer, text, text, timestamptz, timestamptz, text
);

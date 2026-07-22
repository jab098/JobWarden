-- Denormalise the source provider onto public.jobs.
--
-- A published listing has to show its source attribution — Adzuna's licence
-- requires the exact "Jobs by Adzuna" credit on every Adzuna listing — but a
-- signed-in user cannot learn the provider by joining public.job_sources: that
-- table is administrator-only (`using (public.is_admin())`), so the join would
-- silently return nothing and the attribution would never render. The provider
-- therefore lives on the job row, which approved users already read.
--
-- It is kept in sync by a trigger rather than the writer, so the Edge Function
-- repository needs no change and every path that writes a job — now or later —
-- gets it for free. Provider is immutable per source, so the trigger only has
-- to fire when a row is inserted or its source_id changes.

alter table public.jobs
  add column if not exists source_provider text;

create or replace function public.set_job_source_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select provider
  into new.source_provider
  from public.job_sources
  where id = new.source_id;
  return new;
end;
$$;

-- A trigger function is invoked by the system, never called directly, so no
-- role needs execute. Revoke the default public grant to keep the surface tight.
revoke all on function public.set_job_source_provider() from public, anon, authenticated;

drop trigger if exists jobs_set_source_provider on public.jobs;
create trigger jobs_set_source_provider
  before insert or update of source_id on public.jobs
  for each row
  execute function public.set_job_source_provider();

-- Backfill the rows that predate the column.
update public.jobs as j
set source_provider = s.provider
from public.job_sources as s
where s.id = j.source_id
  and j.source_provider is distinct from s.provider;

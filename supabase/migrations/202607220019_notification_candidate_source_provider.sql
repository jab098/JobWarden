-- Carry source_provider into the digest candidate rows, so the digest email can
-- credit an Adzuna listing ("Jobs by Adzuna") the same way the app surfaces do.
-- Regenerated from public.list_notification_candidate_jobs with one added
-- column; create or replace, so the grant/ACL is preserved. The function is
-- SECURITY DEFINER and already reads public.jobs, which now carries the column.

create or replace function public.list_notification_candidate_jobs(
  max_jobs integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if max_jobs is null or max_jobs < 1 or max_jobs > 500 then
    raise exception using errcode = '22023', message = 'invalid job limit';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(candidate))
    from (
      select
        job.id,
        job.source_provider,
        job.title,
        job.employer,
        job.description_text,
        coalesce((
          select location.raw_location
          from public.job_locations as location
          where location.job_id = job.id
          order by location.raw_location
          limit 1
        ), 'UK location not specified') as location,
        job.employment_type,
        job.working_time,
        job.workplace_type,
        job.ir35_status,
        job.compensation_minimum,
        job.compensation_maximum,
        job.compensation_period,
        job.compensation_provenance,
        job.posted_at
      from public.jobs as job
      where job.lifecycle_status = 'active'
      order by job.posted_at desc nulls last, job.id desc
      limit max_jobs
    ) as candidate
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_notification_candidate_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.list_notification_candidate_jobs(integer)
  to service_role;

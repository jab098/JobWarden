create or replace function public.has_approved_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.access_requests
    where user_id = auth.uid()
      and status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.has_approved_access() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.has_approved_access() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.access_requests enable row level security;
alter table public.access_requests force row level security;
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.job_sources enable row level security;
alter table public.job_sources force row level security;
alter table public.jobs enable row level security;
alter table public.jobs force row level security;
alter table public.job_locations enable row level security;
alter table public.job_locations force row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ingestion_runs force row level security;
alter table public.ingestion_source_runs enable row level security;
alter table public.ingestion_source_runs force row level security;

create policy "users read own profile"
on public.profiles for select to authenticated
using (user_id = auth.uid());

create policy "administrators read all profiles"
on public.profiles for select to authenticated
using (public.is_admin());

create policy "users read own access request"
on public.access_requests for select to authenticated
using (user_id = auth.uid());

create policy "administrators read all access requests"
on public.access_requests for select to authenticated
using (public.is_admin());

create policy "administrators read roles"
on public.user_roles for select to authenticated
using (public.is_admin());

create policy "administrators read audit log"
on public.audit_log for select to authenticated
using (public.is_admin());

create policy "administrators read job sources"
on public.job_sources for select to authenticated
using (public.is_admin());

create policy "approved users read active jobs"
on public.jobs for select to authenticated
using (public.has_approved_access() and lifecycle_status = 'active');

create policy "administrators read all jobs"
on public.jobs for select to authenticated
using (public.is_admin());

create policy "approved users read active job locations"
on public.job_locations for select to authenticated
using (
  public.has_approved_access()
  and exists (
    select 1
    from public.jobs
    where public.jobs.id = public.job_locations.job_id
      and public.jobs.lifecycle_status = 'active'
  )
);

create policy "administrators read all job locations"
on public.job_locations for select to authenticated
using (public.is_admin());

create policy "administrators read ingestion runs"
on public.ingestion_runs for select to authenticated
using (public.is_admin());

create policy "administrators read source ingestion runs"
on public.ingestion_source_runs for select to authenticated
using (public.is_admin());

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select allow_access_requests
    from private.app_settings
    where singleton = true
  ) then
    insert into public.profiles (user_id, display_name)
    values (
      new.id,
      left(coalesce(new.raw_user_meta_data ->> 'full_name', 'JobWarden user'), 200)
    )
    on conflict (user_id) do nothing;

    insert into public.access_requests (user_id, status)
    values (new.id, 'pending')
    on conflict (user_id) do nothing;

    insert into public.audit_log (
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      new.id,
      'access.requested',
      'access_request',
      new.id::text,
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

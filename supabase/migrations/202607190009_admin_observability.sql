begin;

-- The audit log has been written since Task 1 and the AI ledger since Task 10;
-- neither has ever had a way to read it. These are bounded, administrator-only
-- reads over data that already exists — nothing new is collected.

-- Bounded, paginated audit read. Metadata is returned as stored: the writers
-- already exclude CV text, job descriptions, request bodies, and tokens, and
-- this function adds no new content to that.
create or replace function public.list_audit_log(
  max_entries integer,
  before_created_at timestamptz
)
returns table (
  id uuid,
  actor_user_id uuid,
  action text,
  resource_type text,
  resource_id text,
  metadata jsonb,
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
    entry.id,
    entry.actor_user_id,
    entry.action,
    entry.resource_type,
    entry.resource_id,
    entry.metadata,
    entry.created_at
  from public.audit_log as entry
  where before_created_at is null or entry.created_at < before_created_at
  order by entry.created_at desc, entry.id desc
  limit max_entries;
end;
$$;

revoke all on function public.list_audit_log(integer, timestamptz)
  from public, anon;
grant execute on function public.list_audit_log(integer, timestamptz)
  to authenticated;

-- Application-wide delivery and AI figures, counted from the same rows the
-- runtimes write. Deliberately aggregate: an administrator needs to know
-- whether the free tier is about to run out, not who received what.
create or replace function public.admin_operational_health(
  daily_limit integer,
  monthly_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  daily_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  monthly_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  sent_today integer;
  sent_this_month integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'administrator access required';
  end if;
  if daily_limit is null or daily_limit < 0
    or monthly_limit is null or monthly_limit < 0 then
    raise exception using errcode = '22023', message = 'invalid delivery limit';
  end if;

  -- In-flight rows count, exactly as the send path counts them, so the
  -- headroom shown here is the headroom the runtime will actually apply.
  select count(*)::integer into sent_today
  from public.career_notification_deliveries as delivery
  where delivery.status in ('pending', 'sent')
    and delivery.created_at >= daily_start;

  select count(*)::integer into sent_this_month
  from public.career_notification_deliveries as delivery
  where delivery.status in ('pending', 'sent')
    and delivery.created_at >= monthly_start;

  return jsonb_build_object(
    'deliveries', jsonb_build_object(
      'sentToday', sent_today,
      'sentThisMonth', sent_this_month,
      'dailyLimit', daily_limit,
      'monthlyLimit', monthly_limit,
      'dailyHeadroom', greatest(0, daily_limit - sent_today),
      'monthlyHeadroom', greatest(0, monthly_limit - sent_this_month),
      'failed', (
        select count(*)::integer
        from public.career_notification_deliveries as delivery
        where delivery.status = 'failed'
          and delivery.created_at >= monthly_start
      ),
      'suppressedNoMatches', (
        select count(*)::integer
        from public.career_notification_deliveries as delivery
        where delivery.status = 'suppressed_no_matches'
          and delivery.created_at >= monthly_start
      ),
      'suppressedByCap', (
        select count(*)::integer
        from public.career_notification_deliveries as delivery
        where delivery.status in ('suppressed_daily_cap', 'suppressed_monthly_cap')
          and delivery.created_at >= monthly_start
      )
    ),
    'ai', jsonb_build_object(
      -- The ceiling is deliberately zero unless the owner raised it, so a
      -- zero here is configuration rather than a fault.
      'dailyAllowance', coalesce((
        select settings.career_ai_daily_allowance
        from private.app_settings as settings
        where settings.singleton
      ), 0),
      'usedToday', coalesce((
        select usage.attempt_count
        from public.career_ai_daily_usage as usage
        where usage.usage_date = (now() at time zone 'UTC')::date
      ), 0)
    )
  );
end;
$$;

revoke all on function public.admin_operational_health(integer, integer)
  from public, anon;
grant execute on function public.admin_operational_health(integer, integer)
  to authenticated;

commit;

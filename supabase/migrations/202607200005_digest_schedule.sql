begin;

-- Per-owner digest cadence. The shared ingestion runtime still updates at the
-- four approved weekday slots; these columns say which of those the owner
-- actually wants to hear about. Hours are constrained to that vocabulary
-- because a digest at any other hour would report on nothing new, and to at
-- most three a day so a single owner cannot consume the application-wide free
-- allowance on their own.
alter table public.career_notification_settings
  add column digest_hours smallint[] not null default '{9,15}'::smallint[],
  add column digest_weekdays smallint[] not null default '{1,2,3,4,5}'::smallint[];

alter table public.career_notification_settings
  add constraint career_notification_settings_hours_valid check (
    cardinality(digest_hours) between 1 and 3
    and digest_hours <@ array[9, 12, 15, 18]::smallint[]
  ),
  add constraint career_notification_settings_weekdays_valid check (
    cardinality(digest_weekdays) between 1 and 5
    and digest_weekdays <@ array[1, 2, 3, 4, 5]::smallint[]
  );

-- Kept separate from set_career_notification_settings so the on/off switch and
-- the cadence stay independently callable: turning digests off must not have to
-- restate a schedule, and changing a schedule must not resurrect a disabled
-- channel.
create or replace function public.set_career_digest_schedule(
  target_hours smallint[],
  target_weekdays smallint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if target_hours is null
    or cardinality(target_hours) < 1
    or cardinality(target_hours) > 3
    or not (target_hours <@ array[9, 12, 15, 18]::smallint[]) then
    raise exception using errcode = '22023', message = 'invalid digest hours';
  end if;
  if target_weekdays is null
    or cardinality(target_weekdays) < 1
    or cardinality(target_weekdays) > 5
    or not (target_weekdays <@ array[1, 2, 3, 4, 5]::smallint[]) then
    raise exception using errcode = '22023', message = 'invalid digest weekdays';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  insert into public.career_notification_settings (
    owner_id, digest_hours, digest_weekdays
  )
  values (actor_user_id, target_hours, target_weekdays)
  on conflict (owner_id) do update
  set digest_hours = excluded.digest_hours,
      digest_weekdays = excluded.digest_weekdays,
      updated_at = clock_timestamp();
end;
$$;

revoke all on function public.set_career_digest_schedule(smallint[], smallint[])
  from public, anon;
grant execute on function public.set_career_digest_schedule(smallint[], smallint[])
  to authenticated;

-- Recreated to honour the per-owner cadence. An owner whose schedule excludes
-- this slot is not a recipient at all, so the runtime never claims a slot for
-- them and the delivery ledger stays an honest record of what they asked for.
create or replace function public.list_pending_notification_digests(
  target_slot text,
  max_owners integer
)
returns table (
  owner_id uuid,
  email text,
  unsubscribe_token uuid,
  searches jsonb,
  evidence jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  slot_hour smallint;
  slot_weekday smallint;
begin
  if target_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    raise exception using errcode = '22023', message = 'invalid slot key';
  end if;
  if max_owners is null or max_owners < 1 or max_owners > 200 then
    raise exception using errcode = '22023', message = 'invalid owner limit';
  end if;

  slot_hour := substring(target_slot from 12 for 2)::smallint;
  slot_weekday := extract(
    isodow from substring(target_slot from 1 for 10)::date
  )::smallint;

  return query
  select
    settings.owner_id,
    account.email::text,
    settings.unsubscribe_token,
    -- Both projections are bounded here rather than only in the runtime's
    -- schema. An owner with more rows than the runtime accepts must degrade to
    -- their oldest searches, not fail validation and take every other owner's
    -- digest down with them. The limits match MAX_SEARCHES_PER_OWNER and
    -- MAX_EVIDENCE_PER_OWNER in the function's contracts.
    coalesce((
      select jsonb_agg(to_jsonb(search) order by search.created_at, search.id)
      from (
        select *
        from public.search_profiles as candidate
        where candidate.user_id = settings.owner_id
          and candidate.enabled
          and candidate.notifications_enabled
        order by candidate.created_at, candidate.id
        limit 25
      ) as search
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'normalized_concept', item.normalized_concept,
          'label', item.label,
          'category', item.category,
          'origin', item.origin,
          'confidence', item.confidence,
          'evidence_reference', item.evidence_reference,
          'proficiency_signal', item.proficiency_signal,
          'last_used_at', item.last_used_at,
          'confirmation_state', item.confirmation_state
        )
        order by item.created_at, item.id
      )
      from (
        select *
        from public.career_evidence_items as candidate
        where candidate.user_id = settings.owner_id
          and candidate.confirmation_state = 'confirmed'
        order by candidate.created_at, candidate.id
        limit 250
      ) as item
    ), '[]'::jsonb)
  from public.career_notification_settings as settings
  join auth.users as account on account.id = settings.owner_id
  where settings.channel_enabled
    and slot_hour = any (settings.digest_hours)
    and slot_weekday = any (settings.digest_weekdays)
    and account.email is not null
    and exists (
      select 1
      from public.access_requests as request
      where request.user_id = settings.owner_id
        and request.status = 'approved'
    )
    and exists (
      select 1
      from public.search_profiles as search
      where search.user_id = settings.owner_id
        and search.enabled
        and search.notifications_enabled
    )
    and not exists (
      select 1
      from public.career_notification_deliveries as delivery
      where delivery.owner_id = settings.owner_id
        and delivery.slot_key = target_slot
    )
  order by settings.owner_id
  limit max_owners;
end;
$$;

revoke all on function public.list_pending_notification_digests(text, integer)
  from public, anon, authenticated;
grant execute on function public.list_pending_notification_digests(text, integer)
  to service_role;

commit;

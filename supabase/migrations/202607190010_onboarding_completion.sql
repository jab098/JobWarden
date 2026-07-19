begin;

-- Completion used to write through four separate RPCs from the application, so
-- a failure between any two of them could leave a saved search with no
-- completion, or a completion whose digest and Explore choices were never
-- recorded. A plpgsql body is one transaction: the user's whole first-run
-- configuration lands, or none of it does and they retry from a state that
-- still honestly says "not onboarded".
--
-- Every callee is left exactly as it was. Each one re-derives the owner from
-- auth.uid(), re-checks approved access, and re-takes the same per-owner
-- generation fence, so this wrapper adds atomicity without weakening a single
-- one of their checks. complete_onboarding still refuses unless every step of
-- the chosen path is recorded, which is what stops a crafted call here from
-- skipping the flow and unlocking the hub.
create or replace function public.finish_onboarding(
  expected_generation bigint,
  draft_value jsonb,
  notifications_enabled boolean,
  explore_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  saved_search_id uuid;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if notifications_enabled is null or explore_enabled is null then
    raise exception using errcode = '22023', message = 'onboarding choices required';
  end if;

  saved_search_id := public.save_search_profile(
    null, expected_generation, draft_value
  );
  perform public.set_career_notification_settings(notifications_enabled);
  perform public.set_explore_enabled(explore_enabled);
  -- Last, so the gate opens only once everything behind it exists.
  perform public.complete_onboarding();

  return saved_search_id;
end;
$$;

revoke all on function public.finish_onboarding(bigint, jsonb, boolean, boolean)
  from public, anon;
grant execute on function public.finish_onboarding(bigint, jsonb, boolean, boolean)
  to authenticated;

commit;

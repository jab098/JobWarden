begin;

-- Going back a step in onboarding.
--
-- Requested by an owner who reached step 3, needed to replace the CV they gave
-- at step 1, and found no way to return to it. Every answer was final the
-- moment it was given, which is not how anyone fills in a form.
--
-- **Going back is un-completing a step, not storing a cursor.**
-- `next_onboarding_step` already resolves to the earliest step a path still
-- needs, so removing one entry from `completed_steps` moves the reader there,
-- and answering it again puts them back exactly where they were. Adding a
-- separate "current step" column would create a second notion of where the
-- reader is, free to disagree with the first.
--
-- The guards are `advance_onboarding`'s, deliberately: same approved-access
-- check, same path membership check, same generation mutex taken before any
-- mutable row. Going backwards is not a lesser operation than going forwards.
--
-- It refuses to reopen a finished flow. `completed_at` is what
-- `is_onboarding_complete` reads, so removing a step from a completed state
-- would pull somebody back out of the product they had finished setting up.
-- Changing an answer after that is what the career profile is for.
create or replace function public.revisit_onboarding_step(target_step text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_path text;
  current_completed text[];
  current_completed_at timestamptz;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  select state.path, state.completed_steps, state.completed_at
  into current_path, current_completed, current_completed_at
  from public.career_onboarding_state as state
  where state.owner_id = actor_user_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'onboarding has not started';
  end if;

  if current_completed_at is not null then
    raise exception using errcode = '22023', message = 'onboarding is already complete';
  end if;

  if not (target_step = any (public.onboarding_steps_for_path(current_path))) then
    raise exception using errcode = '22023', message = 'step not part of this path';
  end if;

  -- Only a step that was actually answered can be returned to. Removing one
  -- that was never completed would leave `completed_steps` unchanged while
  -- reporting success, which is a control that appears to work and does not.
  if not (target_step = any (current_completed)) then
    raise exception using errcode = '22023', message = 'step has not been completed';
  end if;

  update public.career_onboarding_state
  set completed_steps = array_remove(completed_steps, target_step),
      updated_at = now()
  where owner_id = actor_user_id;
end;
$$;

revoke all on function public.revisit_onboarding_step(text) from public, anon;
grant execute on function public.revisit_onboarding_step(text) to authenticated;

commit;

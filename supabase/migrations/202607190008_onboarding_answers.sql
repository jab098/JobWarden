begin;

-- Onboarding is answered across several visits, so the partial answers need a
-- home between them. They live on the state row rather than in a session, so
-- abandoning the flow and returning on another device loses nothing.
alter table public.career_onboarding_state
  add column answers jsonb not null default '{}'::jsonb check (
    jsonb_typeof(answers) = 'object'
    and octet_length(answers::text) <= 32768
  );

-- Merges one step's slice into the stored answers. Merging rather than
-- replacing means a step can be revisited without wiping the answers given
-- after it.
create or replace function public.save_onboarding_answers(
  answers_value jsonb
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
  if answers_value is null
    or jsonb_typeof(answers_value) <> 'object'
    or octet_length(answers_value::text) > 32768 then
    raise exception using errcode = '22023', message = 'invalid onboarding answers';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  insert into public.career_onboarding_state (owner_id, answers)
  values (actor_user_id, answers_value)
  on conflict (owner_id) do update
  set answers = public.career_onboarding_state.answers || excluded.answers,
      updated_at = clock_timestamp();
end;
$$;

revoke all on function public.save_onboarding_answers(jsonb) from public, anon;
grant execute on function public.save_onboarding_answers(jsonb) to authenticated;

commit;

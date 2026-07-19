begin;

-- The CV upload client has to know whether uploads are open before it renders a
-- file input, and `career_cv_uploads_enabled()` is the server-controlled switch
-- that decides. The client cannot call that function directly: it is revoked
-- from `anon` and reading it through a second round trip would let the answer
-- drift from the generation the same snapshot just returned. Widening the
-- snapshot keeps the flag and the fence in one consistent read.
--
-- Adding a key is backward compatible in both directions. An older client that
-- ignores `uploadsEnabled` keeps working against this database, and the newer
-- client treats a missing key as false, so it also works against an older one.

create or replace function public.get_career_profile_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;

  return jsonb_build_object(
    'generation', coalesce((
      select fence.generation
      from public.career_profile_generations as fence
      where fence.user_id = actor_user_id
    ), 0),
    'uploadsEnabled', public.career_cv_uploads_enabled(),
    'profile', (
      select to_jsonb(profile)
      from public.career_profiles as profile
      where profile.user_id = actor_user_id
    ),
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(evidence) order by evidence.created_at, evidence.id)
      from public.career_evidence_items as evidence
      where evidence.user_id = actor_user_id
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(to_jsonb(suggestion) order by suggestion.proposed_at, suggestion.id)
      from public.profile_suggestions as suggestion
      where suggestion.user_id = actor_user_id
    ), '[]'::jsonb),
    'searches', coalesce((
      select jsonb_agg(to_jsonb(search) order by search.created_at, search.id)
      from public.search_profiles as search
      where search.user_id = actor_user_id
    ), '[]'::jsonb),
    'cvs', coalesce((
      select jsonb_agg(to_jsonb(document) order by document.uploaded_at, document.id)
      from public.cv_documents as document
      where document.user_id = actor_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_career_profile_snapshot() from public, anon;
grant execute on function public.get_career_profile_snapshot() to authenticated;

commit;

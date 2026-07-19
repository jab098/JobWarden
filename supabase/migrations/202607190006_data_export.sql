begin;

-- Deletion has existed since Task 10; export has not, and UK GDPR gives a data
-- subject a right to both. One owner-fenced read returns the owner's own rows
-- as a single JSON bundle.
--
-- CV documents appear as metadata only. The file bytes stay in private Storage
-- and are downloaded through the existing owner-only path, so this function
-- cannot become a way to pull documents out through the Data API.
create or replace function public.export_career_profile_data()
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
    'exportedAt', to_jsonb(now()),
    'schemaVersion', to_jsonb(1),
    'profile', (
      select to_jsonb(profile)
      from public.career_profiles as profile
      where profile.user_id = actor_user_id
    ),
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at, item.id)
      from public.career_evidence_items as item
      where item.user_id = actor_user_id
    ), '[]'::jsonb),
    'searchProfiles', coalesce((
      select jsonb_agg(to_jsonb(search) order by search.created_at, search.id)
      from public.search_profiles as search
      where search.user_id = actor_user_id
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(to_jsonb(suggestion) order by suggestion.proposed_at, suggestion.id)
      from public.profile_suggestions as suggestion
      where suggestion.user_id = actor_user_id
    ), '[]'::jsonb),
    'jobDecisions', coalesce((
      select jsonb_agg(to_jsonb(decision) order by decision.updated_at, decision.job_id)
      from public.career_job_decisions as decision
      where decision.owner_id = actor_user_id
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(to_jsonb(application) order by application.created_at, application.id)
      from public.career_applications as application
      where application.owner_id = actor_user_id
    ), '[]'::jsonb),
    'applicationEvents', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.occurred_at, event.id)
      from public.career_application_events as event
      where event.owner_id = actor_user_id
    ), '[]'::jsonb),
    'exploreSettings', (
      select to_jsonb(settings)
      from public.career_explore_settings as settings
      where settings.owner_id = actor_user_id
    ),
    'pathwayDecisions', coalesce((
      select jsonb_agg(to_jsonb(decision) order by decision.updated_at, decision.id)
      from public.career_pathway_decisions as decision
      where decision.owner_id = actor_user_id
    ), '[]'::jsonb),
    'notificationSettings', (
      -- The unsubscribe token is a credential, not user content, so it is
      -- deliberately absent from the export.
      select jsonb_build_object(
        'channel_enabled', settings.channel_enabled,
        'created_at', settings.created_at,
        'updated_at', settings.updated_at
      )
      from public.career_notification_settings as settings
      where settings.owner_id = actor_user_id
    ),
    'notificationDeliveries', coalesce((
      select jsonb_agg(to_jsonb(delivery) order by delivery.created_at, delivery.id)
      from public.career_notification_deliveries as delivery
      where delivery.owner_id = actor_user_id
    ), '[]'::jsonb),
    'cvVariants', coalesce((
      select jsonb_agg(to_jsonb(variant) order by variant.created_at, variant.id)
      from public.career_cv_variants as variant
      where variant.owner_id = actor_user_id
    ), '[]'::jsonb),
    'cvDocuments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', document.id,
          'original_file_name', document.original_file_name,
          'file_kind', document.file_kind,
          'media_type', document.media_type,
          'byte_size', document.byte_size,
          'sha256', document.sha256,
          'lifecycle_status', document.lifecycle_status,
          'is_current', document.is_current,
          'uploaded_at', document.uploaded_at
        )
        order by document.uploaded_at, document.id
      )
      from public.cv_documents as document
      where document.user_id = actor_user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_career_profile_data() from public, anon;
grant execute on function public.export_career_profile_data() to authenticated;

commit;

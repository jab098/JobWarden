begin;

-- S4 — per-user CV registration rate limit.
--
-- Every `register_cv_document` marks the previous document non-current and
-- inserts a new one; only the *current* document is deletable, so replaced
-- documents and their 5 MB storage objects accumulate for the life of the
-- profile. An approved account scripting the upload handshake could therefore
-- grow storage without bound, and each registration also spends an extraction
-- run against the shared free-tier ceiling.
--
-- The guard is a rolling-24h *rate* limit rather than a lifetime total: a total
-- cap would eventually lock out a legitimate user who has no way to prune their
-- own replaced history, whereas a rate limit stops the scripted burst that is
-- the actual abuse and resets on its own. Ten registrations a day is far above
-- any genuine CV-iteration workflow and well below an abuse rate.
--
-- The body below is `202607180004`'s `register_cv_document` reproduced verbatim
-- with the single guard added after the existing entry checks. `create or
-- replace` (never drop) preserves the ACL, per the standing rule.
--
-- ponytail: register-time cap bounds *registered* documents; a malicious client
-- that uploads but never registers can still orphan storage objects. Closing
-- that needs a durable begin-intent counter or an orphan sweep — tracked, not
-- done here.

create or replace function public.register_cv_document(
  expected_generation bigint,
  storage_path_value text,
  original_file_name_value text,
  file_kind_value text,
  media_type_value text,
  byte_size_value integer,
  sha256_value text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  document_id uuid;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if not public.career_cv_uploads_enabled() then
    raise exception using errcode = '42501', message = 'CV uploads disabled';
  end if;
  if expected_generation < 0 then
    raise exception using errcode = '22023', message = 'invalid profile generation';
  end if;

  -- Rolling-24h per-user rate limit. Raised before any write so a limited
  -- request touches nothing.
  if (
    select count(*)
    from public.cv_documents as recent
    where recent.user_id = actor_user_id
      and recent.uploaded_at > clock_timestamp() - interval '24 hours'
  ) >= 10 then
    raise exception using
      errcode = '53400',
      message = 'daily CV upload limit reached';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
    and fence.generation = expected_generation
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'stale career profile snapshot';
  end if;
  if not exists (
    select 1
    from public.career_cv_upload_intents as intent
    where intent.user_id = actor_user_id
      and intent.storage_path = storage_path_value
      and intent.generation = expected_generation
      and intent.expires_at > clock_timestamp()
  ) then
    raise exception using errcode = '42501', message = 'valid CV upload intent required';
  end if;
  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'career-documents'
      and object.name = storage_path_value
  ) then
    raise exception using errcode = '23503', message = 'Storage object must exist first';
  end if;

  insert into public.career_profiles (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;

  update public.cv_documents
  set
    is_current = false,
    replaced_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where user_id = actor_user_id and is_current;

  insert into public.cv_documents (
    user_id,
    storage_path,
    original_file_name,
    file_kind,
    media_type,
    byte_size,
    sha256
  )
  values (
    actor_user_id,
    storage_path_value,
    original_file_name_value,
    file_kind_value,
    media_type_value,
    byte_size_value,
    sha256_value
  )
  returning id into document_id;

  delete from public.career_cv_upload_intents
  where user_id = actor_user_id and storage_path = storage_path_value;

  return document_id;
end;
$$;

commit;

begin;

alter table public.cv_extraction_runs
  add column proposal_expires_at timestamptz,
  add column proposal_expired_at timestamptz;

update public.cv_extraction_runs
set proposal_expires_at = completed_at + interval '24 hours'
where status = 'succeeded' and proposal is not null;

alter table public.cv_extraction_runs
  drop constraint cv_extraction_runs_result_state,
  add constraint cv_extraction_runs_result_state check (
    (
      status = 'succeeded'
      and error_code is null
      and completed_at is not null
      and proposal_expires_at is not null
      and (
        (proposal is not null and proposal_expired_at is null)
        or (proposal is null and proposal_expired_at is not null)
      )
    )
    or (
      status = 'failed'
      and proposal is null
      and error_code is not null
      and completed_at is not null
      and proposal_expires_at is null
      and proposal_expired_at is null
    )
    or (
      status in ('queued', 'running')
      and proposal is null
      and error_code is null
      and completed_at is null
      and proposal_expires_at is null
      and proposal_expired_at is null
    )
  );

create or replace function public.complete_career_profile_extraction(
  target_run_id uuid,
  target_claim_token uuid,
  requested_status text,
  proposal_value jsonb,
  sanitised_error_code text,
  input_character_count_value integer,
  evidence_count_value integer,
  suggestion_count_value integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.cv_extraction_runs%rowtype;
  target_user_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if requested_status not in ('succeeded', 'failed') then
    raise exception using errcode = '22023', message = 'invalid completion status';
  end if;
  if input_character_count_value not between 0 and 100000
    or evidence_count_value not between 0 and 250
    or suggestion_count_value not between 0 and 100 then
    raise exception using errcode = '22023', message = 'invalid completion counts';
  end if;
  if requested_status = 'succeeded' and (
    proposal_value is null
    or sanitised_error_code is not null
    or jsonb_typeof(proposal_value) <> 'object'
    or jsonb_typeof(proposal_value -> 'evidence') <> 'array'
    or jsonb_typeof(proposal_value -> 'suggestions') <> 'array'
    or jsonb_typeof(proposal_value -> 'aiSuggestions') <> 'array'
    or jsonb_array_length(proposal_value -> 'evidence') <> evidence_count_value
    or jsonb_array_length(proposal_value -> 'suggestions')
      + jsonb_array_length(proposal_value -> 'aiSuggestions')
      <> suggestion_count_value
    or octet_length(proposal_value::text) > 262144
  ) then
    raise exception using errcode = '22023', message = 'invalid success result';
  end if;
  if requested_status = 'failed' and (
    proposal_value is not null
    or sanitised_error_code not in (
      'invalid_file', 'unsupported_type', 'file_too_large', 'unsafe_archive',
      'encrypted_pdf', 'page_limit', 'extraction_timeout', 'storage_missing',
      'internal_error'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid failure result';
  end if;

  select run.user_id into target_user_id
  from public.cv_extraction_runs as run
  where run.id = target_run_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'active extraction claim not found';
  end if;
  insert into public.career_profile_generations (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = target_user_id
  for update;

  select run.* into run_record
  from public.cv_extraction_runs as run
  where run.id = target_run_id
    and run.claim_token = target_claim_token
    and run.status = 'running'
    and run.lease_expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'active extraction claim not found';
  end if;

  update public.cv_extraction_runs
  set
    status = requested_status,
    proposal = proposal_value,
    error_code = sanitised_error_code,
    input_character_count = input_character_count_value,
    evidence_count = evidence_count_value,
    suggestion_count = suggestion_count_value,
    completed_at = clock_timestamp(),
    claim_token = null,
    lease_expires_at = null,
    proposal_expires_at = case
      when requested_status = 'succeeded'
        then clock_timestamp() + interval '24 hours'
      else null
    end,
    updated_at = clock_timestamp()
  where id = target_run_id;

  if requested_status = 'succeeded' then
    insert into public.career_evidence_items (
      id,
      user_id,
      cv_document_id,
      normalized_concept,
      label,
      category,
      origin,
      confidence,
      evidence_reference,
      evidence_excerpt,
      proficiency_signal,
      confirmation_state
    )
    select
      item."id",
      run_record.user_id,
      run_record.cv_document_id,
      item."normalizedConcept",
      item."label",
      item."category",
      'cv',
      item."confidence",
      item."evidenceReference",
      item."evidenceExcerpt",
      item."proficiencySignal",
      'proposed'
    from jsonb_to_recordset(proposal_value -> 'evidence') as item(
      "id" uuid,
      "normalizedConcept" text,
      "label" text,
      "category" text,
      "confidence" numeric,
      "evidenceReference" text,
      "evidenceExcerpt" text,
      "proficiencySignal" text
    )
    on conflict (user_id, category, normalized_concept) do update set
      cv_document_id = excluded.cv_document_id,
      origin = 'cv',
      label = excluded.label,
      confidence = excluded.confidence,
      evidence_reference = excluded.evidence_reference,
      evidence_excerpt = excluded.evidence_excerpt,
      proficiency_signal = excluded.proficiency_signal,
      confirmation_state = 'proposed',
      updated_at = clock_timestamp()
    where public.career_evidence_items.origin = 'cv';

    insert into public.profile_suggestions (
      user_id,
      extraction_run_id,
      kind,
      normalized_concept,
      label,
      confidence,
      evidence_item_ids,
      state
    )
    select
      run_record.user_id,
      run_record.id,
      suggestion."kind",
      suggestion."normalizedConcept",
      suggestion."label",
      suggestion."confidence",
      references.ids,
      'proposed'
    from jsonb_to_recordset(proposal_value -> 'suggestions') as suggestion(
      "kind" text,
      "normalizedConcept" text,
      "label" text,
      "confidence" numeric,
      "evidenceReferences" jsonb
    )
    cross join lateral (
      select array_agg(evidence.id order by evidence.id) as ids
      from public.career_evidence_items as evidence
      where evidence.user_id = run_record.user_id
        and evidence.cv_document_id = run_record.cv_document_id
        and evidence.evidence_reference in (
          select jsonb_array_elements_text(suggestion."evidenceReferences")
        )
    ) as references
    where cardinality(references.ids) between 1 and 30
    on conflict (extraction_run_id, kind, normalized_concept) do nothing;

    insert into public.profile_suggestions (
      id,
      user_id,
      extraction_run_id,
      kind,
      normalized_concept,
      label,
      confidence,
      evidence_item_ids,
      state,
      proposed_at
    )
    select
      suggestion."id",
      run_record.user_id,
      run_record.id,
      suggestion."kind",
      suggestion."normalizedConcept",
      suggestion."label",
      suggestion."confidence",
      references.ids,
      'proposed',
      clock_timestamp()
    from jsonb_to_recordset(proposal_value -> 'aiSuggestions') as suggestion(
      "id" uuid,
      "kind" text,
      "normalizedConcept" text,
      "label" text,
      "confidence" numeric,
      "evidenceItemIds" jsonb
    )
    cross join lateral (
      select array_agg(evidence.id order by evidence.id) as ids
      from public.career_evidence_items as evidence
      where evidence.user_id = run_record.user_id
        and evidence.cv_document_id = run_record.cv_document_id
        and evidence.id in (
          select value::uuid
          from jsonb_array_elements_text(suggestion."evidenceItemIds") as value
        )
    ) as references
    where cardinality(references.ids) between 1 and 30
      and cardinality(references.ids)
        = jsonb_array_length(suggestion."evidenceItemIds")
    on conflict do nothing;
  end if;

  if requested_status = 'succeeded' then
    update public.cv_documents
    set lifecycle_status = 'ready', updated_at = clock_timestamp()
    where id = run_record.cv_document_id and user_id = run_record.user_id;
  end if;
end;
$$;

create or replace function private.restore_cv_after_failed_extraction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed_document_is_current boolean;
  previous_document_id uuid;
begin
  select document.is_current into failed_document_is_current
  from public.cv_documents as document
  where document.id = new.cv_document_id and document.user_id = new.user_id
  for update;

  if not found then return new; end if;

  if failed_document_is_current then
    select document.id into previous_document_id
    from public.cv_documents as document
    where document.user_id = new.user_id
      and document.id <> new.cv_document_id
      and not document.is_current
      and document.deleted_at is null
      and document.lifecycle_status in ('uploaded', 'ready')
    order by document.replaced_at desc nulls last, document.uploaded_at desc
    limit 1
    for update;
  end if;

  if failed_document_is_current and previous_document_id is not null then
    update public.cv_documents
    set
      lifecycle_status = 'failed',
      is_current = false,
      replaced_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where id = new.cv_document_id and user_id = new.user_id;

    update public.cv_documents
    set is_current = true, replaced_at = null, updated_at = clock_timestamp()
    where id = previous_document_id and user_id = new.user_id;
  else
    update public.cv_documents
    set lifecycle_status = 'failed', updated_at = clock_timestamp()
    where id = new.cv_document_id and user_id = new.user_id;
  end if;

  return new;
end;
$$;

revoke all on function private.restore_cv_after_failed_extraction()
  from public, anon, authenticated, service_role;
drop trigger if exists restore_cv_after_failed_extraction
  on public.cv_extraction_runs;
create trigger restore_cv_after_failed_extraction
after update of status on public.cv_extraction_runs
for each row
when (old.status = 'running' and new.status = 'failed')
execute function private.restore_cv_after_failed_extraction();

create or replace function public.purge_inactive_cv_document(
  target_document_id uuid,
  expected_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select document.user_id into target_user_id
  from public.cv_documents as document
  where document.id = target_document_id
    and document.storage_path = expected_storage_path
    and not document.is_current;
  if not found then
    raise exception using errcode = 'P0002', message = 'inactive CV not found';
  end if;

  insert into public.career_profile_generations (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = target_user_id
  for update;

  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'career-documents'
      and object.name = expected_storage_path
  ) then
    raise exception using
      errcode = '23503',
      message = 'Storage object must be removed first';
  end if;

  delete from public.cv_documents
  where id = target_document_id
    and storage_path = expected_storage_path
    and not is_current;
  if not found then
    raise exception using errcode = 'P0002', message = 'inactive CV not found';
  end if;
end;
$$;

create or replace function public.decide_career_evidence(
  target_evidence_id uuid,
  target_state text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  current_state text;
begin
  if actor_user_id is null or not public.has_approved_access() then
    raise exception using errcode = '42501', message = 'approved access required';
  end if;
  if target_state not in ('confirmed', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid evidence decision';
  end if;

  insert into public.career_profile_generations (user_id)
  values (actor_user_id)
  on conflict (user_id) do nothing;
  perform 1
  from public.career_profile_generations as fence
  where fence.user_id = actor_user_id
  for update;

  select confirmation_state into current_state
  from public.career_evidence_items
  where id = target_evidence_id and user_id = actor_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'career evidence not found';
  end if;
  if current_state = target_state then return current_state; end if;
  if current_state <> 'proposed' then
    raise exception using errcode = '22023', message = 'career evidence already decided';
  end if;

  update public.career_evidence_items
  set confirmation_state = target_state, updated_at = clock_timestamp()
  where id = target_evidence_id and user_id = actor_user_id;
  return target_state;
end;
$$;

create or replace function public.expire_career_profile_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  if auth.role() is distinct from 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  update public.cv_extraction_runs
  set
    proposal = null,
    proposal_expired_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where status = 'succeeded'
    and proposal is not null
    and proposal_expires_at <= clock_timestamp();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.decide_career_evidence(uuid, text)
  from public, anon;
grant execute on function public.decide_career_evidence(uuid, text)
  to authenticated;
revoke all on function public.purge_inactive_cv_document(uuid, text)
  from public, anon, authenticated;
grant execute on function public.purge_inactive_cv_document(uuid, text)
  to service_role;
revoke all on function public.expire_career_profile_proposals()
  from public, anon, authenticated;
grant execute on function public.expire_career_profile_proposals()
  to service_role;

select cron.schedule(
  'jobwarden-career-proposal-expiry',
  '17 * * * *',
  'select public.expire_career_profile_proposals()'
);

commit;

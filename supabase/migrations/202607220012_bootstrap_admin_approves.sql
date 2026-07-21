begin;

-- Found by an owner following the production runbook for the first time.
--
-- `bootstrap_admin` granted the administrator role and stopped. It never
-- touched `access_requests`, so the first owner ended up **administrator and
-- pending at the same time** — and every product surface refused them:
--
--   * `/onboarding` calls `get_career_profile_snapshot`, which raises
--     `approved access required` for a pending request, so the page threw and
--     rendered its error boundary;
--   * `/admin` sits under the protected layout, which redirects an un-onboarded
--     user to `/onboarding` — so it failed in exactly the same way.
--
-- The approval screen is `/admin/access`, which is behind that gate. **The only
-- person who could approve the first administrator was the first
-- administrator, who could not get in.** A deadlock with no way out through the
-- product, and the runbook's stated proof — "you now reach the app, and /admin
-- loads" — could not happen as built.
--
-- Approving here is coherent rather than a shortcut. Whoever runs this holds
-- the service role key, and the function has already refused to proceed without
-- a verified identity. Leaving that person unapproved protects nothing and
-- locks them out of the product they just installed.
--
-- **The separation of the two axes is unchanged.** Being an administrator still
-- does not imply approval for anybody else: this approves exactly the one row
-- belonging to the bootstrapped identity, and only when it is still `pending`,
-- which is the same transition `decide_access_request` permits. A suspended or
-- rejected account is left alone rather than quietly reinstated.
--
-- Both writes are audited, and the approval is attributed to the identity being
-- bootstrapped, which is the truth: they approved themselves, deliberately,
-- while holding the service role key.
--
-- `create or replace`, same signature, so the existing grants stand.
create or replace function public.bootstrap_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_exists boolean;
  identity_verified boolean;
  current_status text;
begin
  select exists (
    select 1
    from auth.users
    where id = target_user_id
  )
  into identity_exists;

  if not identity_exists then
    raise exception using errcode = 'P0002', message = 'Supabase identity not found';
  end if;

  select exists (
    select 1
    from auth.users as target_user
    where target_user.id = target_user_id
      and (
        target_user.email_confirmed_at is not null
        or exists (
          select 1
          from auth.identities as external_identity
          where external_identity.user_id = target_user_id
            and external_identity.provider <> 'email'
            and lower(external_identity.identity_data ->> 'email_verified') = 'true'
        )
      )
  )
  into identity_verified;

  if not identity_verified then
    raise exception using errcode = '22023', message = 'verified Supabase identity required';
  end if;

  insert into public.user_roles (user_id, role, created_by)
  values (target_user_id, 'admin', target_user_id)
  on conflict (user_id, role) do nothing;

  insert into public.audit_log (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    target_user_id,
    'admin.bootstrap',
    'user_role',
    target_user_id::text,
    jsonb_build_object('method', 'local_service_role')
  );

  -- Approve the bootstrapped identity's own access request, and only from
  -- `pending`. `handle_new_user` creates that row at signup, so it exists by
  -- the time anyone can be bootstrapped.
  select status
  into current_status
  from public.access_requests
  where user_id = target_user_id
  for update;

  if found and current_status = 'pending' then
    update public.access_requests
    set
      status = 'approved',
      decided_at = clock_timestamp(),
      decision_reason = 'Bootstrapped as the first administrator.',
      decided_by = target_user_id,
      updated_at = clock_timestamp()
    where user_id = target_user_id;

    insert into public.audit_log (
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      target_user_id,
      'access.decided',
      'access_request',
      target_user_id::text,
      jsonb_build_object(
        'from_status', current_status,
        'to_status', 'approved',
        'method', 'admin_bootstrap'
      )
    );
  end if;
end;
$$;

commit;

# Supabase and Google authentication setup

This guide connects JobWarden's private-beta sign-in flow to a real Supabase project. Authentication creates an identity only. It does not approve access, confer an administrator role, or bypass row-level security (RLS).

Do not paste a Google client secret, Supabase secret/service-role key, database password, access token, or refresh token into chat, an issue, a commit, or a screenshot. Keep secrets in a password manager or a local secret store.

## 1. Create the accounts and project

1. Create or sign in to the [Supabase dashboard](https://supabase.com/dashboard).
2. Create a project in the organisation that will own JobWarden. Record the non-secret project ref and choose a strong database password in your password manager.
3. Wait for provisioning to complete.
4. Open the project's **Connect** dialog and record:
   - the project URL, such as `https://PROJECT_REF.supabase.co`;
   - the `sb_publishable_...` key for the web application.
5. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).

The publishable key is intended for browser use and remains constrained by the signed-in user's RLS policies. A Supabase `sb_secret_...` key bypasses RLS and must never be used by `apps/web`.

## 2. Configure Google OAuth

1. In Google Cloud Console, configure the OAuth consent screen for the intended testing audience. Add only the scopes needed for basic Google identity.
2. Create an OAuth client with application type **Web application**.
3. Add this exact Google authorised redirect URI, replacing `PROJECT_REF`:

   ```text
   https://PROJECT_REF.supabase.co/auth/v1/callback
   ```

4. Store the Google client ID and client secret in your password manager.
5. In Supabase, open **Authentication → Sign In / Providers → Google**.
6. Enable Google, enter the client ID and client secret directly in Supabase, and save.

Google returns to Supabase first. Supabase then returns the PKCE code to JobWarden's `/auth/callback` route.

## 3. Configure Supabase redirect URLs

In **Authentication → URL Configuration**:

1. Set the development Site URL to `http://localhost:3000` while testing locally.
2. Add exact redirect URLs for every deployed environment, for example:

   ```text
   http://localhost:3000/auth/callback
   https://preview.example.com/auth/callback
   https://jobwarden.example/auth/callback
   ```

3. When production is ready, change the Site URL to the production origin.

Prefer exact callback URLs. Do not add an unrestricted external redirect or derive JobWarden's callback origin from request `Host` headers.

## 4. Configure the local web environment

Create `apps/web/.env.local` from the public subset of `.env.example`:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_LOCALLY
```

Do not add `SUPABASE_SERVICE_ROLE_KEY`, an `sb_secret_...` value, the Google client secret, or the database password to `apps/web/.env.local`. Configure the three public variables independently in development, preview, and production deployment environments.

## 5. Apply and verify the database foundation

Install Docker before relying on the local Supabase checks. From the repository root:

```sh
pnpm install
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db lint
pnpm dlx supabase@latest db test
pnpm check:supabase
```

Then authenticate the CLI, link the intended remote project by its non-secret project ref, review the target, and push migrations:

```sh
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref PROJECT_REF
pnpm dlx supabase@latest db push
```

A remote migration push does not replace the clean local reset, database lint, or pgTAP run. Task 4's database foundation remains not deployable until those real Docker-backed checks pass.

## 6. Complete the first sign-in

1. Start the app with `pnpm --filter @jobwarden/web dev`.
2. Open `http://localhost:3000/auth/sign-in` and continue with Google.
3. Confirm Google returns through `/auth/callback`.
4. A new identity should land on `/access/pending`. If access requests are disabled, the page instead explains that the private beta is closed and no request was created.
5. In Supabase **Authentication → Users**, copy the first user's UUID. A user UUID is an identifier, not a credential, but still avoid publishing it unnecessarily.

Do not approve the first user by editing browser cookies, user metadata, email, or request parameters. Those values never confer access or administrator status.

## 7. Bootstrap the first administrator atomically

The existing `bootstrap:admin` command verifies the exact confirmed Supabase identity, calls the transactional `bootstrap_admin` database function, creates the server-controlled role idempotently, and records `admin.bootstrap` in the audit log.

In a local terminal or secret-aware environment runner, provide:

- `NEXT_PUBLIC_SUPABASE_URL`: the project URL;
- `SUPABASE_SERVICE_ROLE_KEY`: preferably a new `sb_secret_...` key from Supabase, mapped to this compatibility variable name;
- `ADMIN_BOOTSTRAP_USER_ID`: the verified user's UUID.

Then run:

```sh
pnpm bootstrap:admin
```

Do not put the `sb_secret_...` value in shell history, `apps/web/.env.local`, `.env.example`, CI logs, or chat. Remove it from the process environment after the command. Re-running the bootstrap for the same identity is safe.

## 8. Verify the access boundary

1. Sign in as the bootstrapped administrator and confirm `/admin` opens.
2. Sign in with a second Google identity and confirm it remains pending.
3. Confirm a pending, rejected, suspended, or closed-beta identity cannot open `/jobs`.
4. Confirm direct browser Data API requests still obey RLS. Layout redirects improve navigation only; RLS remains the final boundary.
5. Sign out and confirm the protected routes return to `/auth/sign-in`.

Live OAuth cannot be completed until the Supabase project, Google provider, callback allowlist, migrations, and local public environment values above are configured.

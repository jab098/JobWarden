# JobWarden Production Setup

**This is the only document you need to take JobWarden from "built" to "live".**

Everything in the product has been built and reviewed against fictional data. Nothing below has been executed, because none of these accounts existed while the product was being built — that was the deliberate plan. Each step says what it unblocks and how to prove it worked.

Work through the steps **in order**. Later steps depend on values produced by earlier ones.

> **Never paste a secret into a chat, an issue, a pull request, or a repository file.** Every secret below goes into a provider's own settings UI or your local `.env.local`, which is git-ignored.

---

## Before you start

| You will need                                           | Why                                       |
| ------------------------------------------------------- | ----------------------------------------- |
| Docker Desktop, running                                 | Step 2 cannot run without it              |
| The Supabase CLI (`brew install supabase/tap/supabase`) | Steps 1–3                                 |
| A domain you control                                    | Steps 5 and 6                             |
| A GitHub account                                        | Already have it — the repository is there |

Total cost at every step: **£0**. Every service below is used inside its free tier, and the application refuses to exceed the configured ceilings.

---

## Step 1 — Supabase project

**Unblocks:** everything. This is the database, authentication, and file storage.

1. Go to [supabase.com](https://supabase.com) and create an account.
2. Create a new project. Choose the **London (eu-west-2)** region — UK users, UK data.
3. Set a strong database password and save it in your password manager. You will not be shown it again.
4. Wait for the project to finish provisioning (about two minutes).
5. From **Project Settings → General**, copy the **Reference ID**.
6. From **Project Settings → API**, copy:
   - the **Project URL**,
   - the **publishable / anon key** (safe for the browser), and
   - the **service role key** (server-only — treat it like a root password).

Put these in `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

and in the repository root `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_PROJECT_REF=<Reference ID>
```

**Proof it worked:** `supabase projects list` shows your project.

---

## Step 2 — Database, migrations, and the real test suite

**Unblocks:** every data-backed feature. Until this passes, the schema has only ever been checked statically.

```sh
supabase link --project-ref <Reference ID>
pnpm verify:live
```

`verify:live` resets a local database, applies all **36 migrations**, runs the database linter, and executes every pgTAP file — **29 files, 615 assertions** covering RLS boundaries, owner fencing, the ingestion runtime, notification ceilings, CV variant expiry, the provider vocabulary, and the audit log's append-only rule. **It fails rather than skipping if Docker is not running**, so a database check can never be recorded as passed when it did not run.

Fix anything it reports before continuing. When it is green:

```sh
supabase db push
```

**Proof it worked:** in the Supabase dashboard, **Table Editor** shows **34 tables**, and **Database → Roles** shows RLS enabled on all of them. `pnpm check:supabase` prints the same counts locally.

---

## Step 3 — Google sign-in

**Unblocks:** real users. Until now the application has run on a local development bypass that cannot work in production.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your email, and add the scopes `email` and `profile`. Leave it in Testing while you are the only user.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
4. Under **Authorised redirect URIs**, add exactly:
   `https://<Reference ID>.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**.
6. In Supabase, **Authentication → Providers → Google**: enable it and paste both values.
7. In Supabase, **Authentication → URL Configuration**, set **Site URL** to `http://localhost:3000` for now. You will change this in step 6.

**Proof it worked:** run `pnpm --filter @jobwarden/web dev` _without_ `JOBWARDEN_DEV_ACCESS_BYPASS`, visit `http://localhost:3000`, and sign in with Google. You should land on **Access pending** — not the jobs feed. That is correct: authentication alone grants nothing.

---

## Step 4 — Make yourself an administrator

**Unblocks:** approving users, configuring sources, and the `/admin` screens.

1. In Supabase, **Authentication → Users**, find the account you just created and copy its **UID**.
2. Add it to the repository root `.env.local`:
   ```
   ADMIN_BOOTSTRAP_USER_ID=<your UID>
   ```
3. Run:
   ```sh
   pnpm bootstrap:admin
   ```

**Proof it worked:** sign in again. You now reach the app, and `/admin` loads. Create a second Google account, sign in with it, and confirm it sits at **Access pending** until you approve it from `/admin/access`. **Do this test — it is the whole access model.**

---

## Step 5 — Private CV storage

**Unblocks:** real CV upload, which has been deliberately closed since Task 10.

1. In Supabase, **Storage → Create bucket**. Name it exactly `career-documents`. Set it **Private**. Set the file size limit to **5 MB**.
2. The owner-only policies are already in the migrations — verify them under **Storage → Policies**: a user may only read and write objects under a prefix matching their own user ID.
3. Deploy the extraction function, or an uploaded CV registers and is never read:
   ```sh
   supabase functions deploy extract-career-profile
   ```
4. **Set `SITE_URL` to the exact origin the browser calls from.** The upload
   happens in the browser, so the function must answer a CORS preflight, and it
   answers only for this one origin — there is no wildcard, because the endpoint
   acts on the caller's bearer token.
   ```sh
   supabase secrets set SITE_URL=http://localhost:3000
   ```
   **Change this to your real origin at step 6**, or CV upload will work locally
   and silently stop working on the deployed site.
5. Only now, enable upload in the application by following the gate documented in [career profile data operations](../operations/career-profile-data.md).

**Proof it worked:** upload a CV as user A. As user B, request user A's storage path directly through the API and confirm you are refused.

---

## Step 6 — Deploy

**Unblocks:** a real URL. ⚠️ **This is the one step in this document that has not been executed at all**, because it cannot be until the account exists. Expect to iterate.

1. Create a [Cloudflare](https://cloudflare.com) account and add your domain.
2. Install the adapter and deploy:
   ```sh
   pnpm add -D @opennextjs/cloudflare wrangler --filter @jobwarden/web
   pnpm --filter @jobwarden/web exec opennextjs-cloudflare build
   pnpm --filter @jobwarden/web exec wrangler deploy
   ```
3. Set every environment variable from step 1 in the Cloudflare **Workers → Settings → Variables** panel. **`SUPABASE_SERVICE_ROLE_KEY` is a secret**, not a plain variable.
4. Set `NEXT_PUBLIC_SITE_URL` to your real origin, e.g. `https://jobwarden.example`.
   Then update the Edge Function's own origin to match, or CV upload breaks on
   the deployed site while still working locally:
   ```sh
   supabase secrets set SITE_URL=https://jobwarden.example
   ```
5. Go back to Supabase **Authentication → URL Configuration** and change **Site URL** to that same origin, adding it to the redirect allow-list.
6. Return to Google Cloud and add `https://<Reference ID>.supabase.co/auth/v1/callback` if you changed anything.

**Proof it worked:** sign in on the real domain and reach the jobs feed. Then confirm `JOBWARDEN_DEV_ACCESS_BYPASS` is **not** set anywhere in Cloudflare — `pnpm check:production` already proves a production build refuses it, but check the deployment too.

---

## Step 7 — Digest emails

**Unblocks:** scheduled notifications. Until `RESEND_API_KEY` exists the runtime reports `delivery_unconfigured` and sends nothing.

Follow [the scheduled digest operations guide](../operations/notifications.md), which has the DNS records and the cron schedule in full. In short:

1. Create a [Resend](https://resend.com) account.
2. Add a **sending subdomain** (`mail.yourdomain.co.uk`), never the apex domain.
3. Add the SPF, DKIM, and DMARC records Resend shows you, in Cloudflare, as **DNS only** (grey cloud).
4. Wait for verification. **Do not skip this** — an unverified domain sends straight to spam.
5. Create a sending-only API key and set the Supabase Edge Function secrets listed in that guide.
6. Deploy the functions and schedule them:
   ```sh
   supabase functions deploy ingest-jobs
   supabase functions deploy send-digests
   supabase functions deploy extract-career-profile
   ```

**Proof it worked:** send one digest to your own address and check the received headers show SPF, DKIM, and DMARC all passing.

---

## Step 8 — Turn on a job source

**Unblocks:** actual jobs. Nothing appears in the feed until a source is enabled.

Five providers need **no credential at all** and are the place to start — Greenhouse, Lever, Ashby and Workable are per-employer boards you add one at a time from `/admin/sources`, and Teaching Vacancies is a national service already implemented. Follow [the shared ingestion operations guide](../operations/ingestion.md) to add a source and trigger a run.

Two national sources need a small owner action first, and both are recorded in [source coverage](../product/source-coverage.md):

- **Find an Apprenticeship** — a free, self-service API key from the DfE developer hub. Cheapest coverage still available.
- **NHS Jobs** — contact NHSBSA for terms in writing. No code exists for it yet.

Reed requires a separate decision: read [the Reed runbook](../operations/reed-ingestion.md) and the [source coverage rules](../product/source-coverage.md) first. Its terms have not been reviewed, which is why it ships disabled.

**Proof it worked:** `/admin/ingestion` shows a completed run, and `/jobs` shows UK roles.

---

## Step 9 — Early access list bot check

Needed before the landing page can accept anyone. Until these are set the
early-access form is not offered at all: it says the list is not open and shows
the sign-in tab instead. That is deliberate, not a bug. A publicly reachable
insert with no bot check is exactly what the check exists to prevent, so the
server action refuses every submission while the secret is missing.

1. In the Cloudflare dashboard open **Turnstile** and add a widget for your
   site's domain. It is free at any volume this product will reach, and unlike
   reCAPTCHA it does not profile the visitor.
2. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Cloudflare. This one is public by
   design; it is rendered into the page.
3. Set `TURNSTILE_SECRET_KEY` in Cloudflare. This one is server-only and must
   never appear in a `NEXT_PUBLIC_` variable, a client component, or a log line.
4. Apply the `202607220001_early_access_list` migration if Step 2 predates it,
   then submit the form once and confirm a row lands in
   `public.early_access_signups`.

The form answers identically whether an address was added or was already on the
list. That is on purpose: an unauthenticated endpoint that distinguishes the two
lets anyone test whether a given email is registered.

---

## Step 10 — Optional error reporting

Skip this until the rest is working.

1. Create a [Sentry](https://sentry.io) account and a project **in the EU region**.
2. Set `NEXT_PUBLIC_SENTRY_DSN` in Cloudflare.

The integration already sets `sendDefaultPii: false` and scrubs CV text, job descriptions, request bodies, cookies, and authorisation headers.

---

## After setup: what to check regularly

| Check              | How                                                                         | Why                                                                                  |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Free-tier headroom | Supabase usage panel; the delivery counter query in the notifications guide | Nothing auto-upgrades to a paid plan, so exhaustion shows as suppression, not a bill |
| Access requests    | `/admin/access`                                                             | New identities stay pending until you act                                            |
| Source health      | `/admin/ingestion`                                                          | A failing source degrades quietly by design                                          |
| Secret rotation    | Provider dashboards                                                         | Rotate the service role key and Resend key if either is ever exposed                 |

## If something goes wrong

- **Nobody can sign in:** check the Supabase Site URL matches your deployed origin exactly, including scheme and no trailing slash.
- **Signed in but seeing "Access pending":** correct for a new user. Approve them at `/admin/access`.
- **Digests not arriving:** check `career_notification_deliveries` for the slot. `suppressed_no_matches` means there was nothing new — that is the feature working.
- **A migration fails on push:** do not edit an applied migration. Add a new one.
- **You exposed a secret:** rotate it at the provider first, then purge it from git history. Removing the line from the current file is not enough.

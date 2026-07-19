# Task 16 — Privacy, production access, deployment, and full-path verification

**Branch:** `codex/task-16-production-readiness`
**Baseline:** `cd2ae35` (local `main` after the Task 17 publication record)
**Sources of truth:** [roadmap Task 16](../../product/roadmap.md#task-16--privacy-production-access-deployment-and-full-path-verification), [shipping standards](../../standards/shipping-standards.md), [free-tier services](../../architecture/free-tier-services.md)

Lenses in play: all of them. This is the task where the deferred platform setup is finally specified, so every lens the programme has been carrying applies at once.

## The constraint that shapes this task

The owner's plan is to create no accounts until the product is built. That is now: this is the last task. It splits cleanly into two halves, and conflating them would be dishonest.

**Half one — what can be built and verified now.** Code, guardrails, documents, and CI. All of it ships in this task and is covered by the usual gate.

**Half two — what cannot exist before an account does.** Live OAuth, a real database, a deployed origin, real DNS. This task's job for that half is to produce instructions precise enough to execute without a further design decision, and to be explicit that they are unverified until executed. Nothing in this half is claimed as done.

## Half one — buildable

### Data export (the real gap)

Deletion has existed since Task 10; **export has not**, and UK GDPR gives a right to both. `export_career_profile_data()` is an owner-fenced security-definer RPC returning one JSON bundle of the owner's own rows — profile, evidence, searches, decisions, applications and their audit trail, explore state, notification settings and delivery history, and CV metadata. It returns *metadata* for CV documents, never file bytes; the file itself is downloaded from Storage through the existing owner-only path. A route handler streams it as an attachment with `no-store`.

### Production hardening

- The guardrail gains two executable rules: no browser analytics SDK may appear anywhere, and no source file may reference the development bypass outside the two reviewed modules that implement it. Both are tested by planting a violation.
- A `check:production` script asserts the built application contains no development-bypass code path and no analytics reference, so the property is verified against the *build output* rather than only the source.

### Legal baseline

`/privacy` and `/terms` as public pages, generated from documents in `docs/privacy/`, naming every subprocessor and the UK transfer mechanism. A guardrail test keeps the subprocessor list in the document and the page in step, so adding a service without disclosing it fails the build.

No cookie-consent gate is added, and that is the honest position rather than an omission: JobWarden sets no non-essential cookies today. The guardrail that forbids an analytics SDK is what keeps that true, and the privacy document records that a consent gate becomes mandatory the moment one is introduced.

### CI

A GitHub Actions workflow running the same gate a human runs — frozen install, format, lint, typecheck, Deno graphs, all tests, guardrails, the Supabase static verifier, the production build, the production-output check, dependency audit, and a full-history secret scan — with least-privilege permissions and no secrets.

### One-command real verification

`scripts/verify-live.mjs` runs the checks that need Docker and a real database — `supabase db reset`, the database lint, and every pgTAP file — and refuses to pretend when Docker is absent. This is what the owner runs after step 2 of the runbook.

## Half two — the owner runbook

`docs/setup/production-setup.md`: one ordered document, every service, exact values, in dependency order — Supabase project, database migration and pgTAP, Google OAuth, administrator bootstrap, Storage bucket and policies, Resend and DNS, Cloudflare deployment, and optional Sentry EU. Each step states what it unblocks, what to paste where, and how to prove it worked. Secrets are named, never exemplified with a plausible-looking value.

Deployment configuration is included but explicitly marked unverified: it cannot be executed before the account exists, and saying otherwise would be the one dishonest sentence in the programme.

## Verification

The full release gate, plus the new `check:production`, plus browser verification of `/privacy` and `/terms`. The live checks are listed as pending with the exact command that will run them.

## Rollback

Additive. One new RPC, one route, two public pages, guardrail rules, and documents.

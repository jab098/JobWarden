# Task 16 Privacy, Production Access, Deployment, and Full-Path Verification Review

**Branch:** `codex/task-16-production-readiness`

**Base:** `main` at `cd2ae35` (Task 17 publication record)

**Review status:** independent review complete; findings remediated at `HEAD` with a clean re-run of the full gate.

## Outcome

This is the last task, and the one where the owner's deferred platform setup is finally specified. It splits into two halves that must not be conflated.

### Half one — built and verified

**Data export.** Deletion has existed since Task 10; export had not, and UK GDPR gives a data subject a right to both. `export_career_profile_data()` is an owner-fenced security-definer read returning one JSON bundle of the owner's own rows across every table the programme added. CV documents appear as **metadata only** — the file bytes stay in private Storage behind the existing owner-only path, so this function cannot become a route for pulling documents out through the Data API. A pgTAP assertion and a guardrail test both check that `storage_path` never appears in the function body. The route applies the access gate explicitly, because a route handler does not run the `(protected)` layout.

**Production hardening.** `pnpm check:production` runs a real production build with `JOBWARDEN_DEV_ACCESS_BYPASS=true` and fails unless the build refuses it — the fail-closed property is now proven against the build output, not only against unit tests, and it runs in CI. The guardrail gained a rule forbidding any browser analytics SDK, which is what keeps the privacy policy's "no non-essential cookies" claim true and is the honest reason no consent gate exists: there is nothing to consent to.

**Legal baseline.** `/privacy` and `/terms` are public pages backed by `docs/privacy/privacy-policy.md`, naming every subprocessor and the UK International Data Transfer Addendum. A guardrail test requires each provider to appear in **both** the document and the page users read, so a service cannot be added without being disclosed.

**CI.** A GitHub Actions workflow runs the same gate a human runs, with `contents: read` and no configured secrets — every check is static or fixture-backed, so CI needs no project, key, or deployed environment. (The secret scanner additionally uses GitHub's auto-provisioned `GITHUB_TOKEN` to read a pull request's commits; this was added after the first PR run failed without it.)

**One-command live verification.** `pnpm verify:live` runs `supabase db reset`, the database lint, and all 17 pgTAP files. It **exits non-zero when Docker is absent** rather than skipping, because a database check recorded as passed when it did not run is how a broken migration reaches production.

### Half two — specified, not executed

`docs/setup/production-setup.md` is a single ordered runbook covering the Supabase project, migrations and the real test suite, Google OAuth, administrator bootstrap, private Storage, deployment, Resend and DNS, job sources, and optional Sentry. Each step states what it unblocks, exactly what to paste where, and how to prove it worked.

**None of it has been executed**, and the document says so in its opening line. The deployment step is marked explicitly as the one step never run at all. Claiming otherwise would have been the single dishonest sentence in the programme.

## Independent review remediation

Two findings, both surfaced by the guardrail catching the new code:

1. **The Resend rule blocked its own required disclosure.** The Task 14 guard forbade any case-insensitive `resend` occurrence outside the adapter, so naming Resend as a subprocessor — which UK GDPR _requires_ — failed the build. The rule now matches the provider's **capability** (a dependency string, an import path, its API host, or its credential) rather than the bare word, and is deliberately case-sensitive on the dependency form because npm package names are lowercase: `"resend"` is a dependency, `"Resend"` is a disclosure. All five planted-violation cases still fail, with one rewritten from a bare-word comment to a real credential reference.
2. **The pricing-copy rule blocked the terms page denying that pricing exists.** Rather than weaken a permanent product invariant, the sentence was reworded. The guard stays maximally strict.

Accepted, recorded observations:

- The export bundle is assembled in one query per table inside a single stable function. For an owner with a very large history this is one large response rather than a paged one. Acceptable at private-beta scale, and a paged export would complicate the subject-access guarantee for no current benefit.
- The development preview refuses to export rather than returning fictional data. Serving invented rows in the shape of a subject-access response would be worse than refusing.
- Deployment configuration is documented rather than committed. An untested `wrangler` configuration in the repository would look verified without being verified.

## Acceptance mapping

| Roadmap criterion                                                                                          | Evidence                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new identity remains pending until an administrator approves it                                          | Implemented and reviewed in Task 5 and Task 7; step 3 and step 4 of the runbook make proving it a required part of setup, with the two-account test called out explicitly.      |
| Direct Supabase access proves RLS denial for other users and non-admins                                    | 17 pgTAP files cover the boundaries; `pnpm verify:live` runs them all and refuses to skip. **Pending execution** — it needs Docker and a project.                               |
| CV Storage, deletion, retention, AI handling, email processing, incident recovery documented and exercised | Documented across the privacy policy, the runbook, and the three operations guides. **Exercised: pending** — every exercise needs live services.                                |
| Production cannot enable any development bypass                                                            | `pnpm check:production` builds for production with the bypass set and fails unless the build refuses it. Runs locally and in CI. **Verified.**                                  |
| Optional analytics stays disabled until affirmative consent and a separate review                          | An executable guardrail rejects six browser analytics SDKs, with planted-violation tests. The privacy policy records that a consent gate becomes mandatory before any is added. |
| Production build, browser paths, pgTAP, secret scan, dependency audit pass                                 | All pass except the live database and deployed-environment checks, which are listed below as pending with the exact command that will run them.                                 |
| The owner receives exact setup instructions only for the services required                                 | One ordered runbook; every service is one JobWarden actually uses, and each step names what it unblocks.                                                                        |

## Verification evidence

- `pnpm verify` passed: 968 workspace tests across 77 files, plus 130 function tests — 1,098 automated tests total.
- `pnpm check:supabase`: 16 migrations, 31 forced-RLS tables.
- `pnpm check:production`: the development bypass fails closed in a production build.
- `pnpm audit --prod`: no known vulnerabilities. No dependency was added.
- `git diff --check` clean; Gitleaks over the staged range found no leaks.
- Browser verification: `/privacy` and `/terms` at true 390 px with no document overflow and no console errors in a fresh tab; the privacy page names all four subprocessors; `/profile/export` returns an honest 503 refusal in the fictional preview rather than inventing a subject-access response.

## What remains pending, and exactly how to clear it

Nothing below can be done without the accounts, which is why it is listed rather than claimed.

| Pending                                                            | Cleared by                                        |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| Real database, migrations, and 17 pgTAP files                      | `pnpm verify:live` after runbook step 1           |
| Live Google OAuth and the pending-until-approved path              | Runbook steps 3–4, including the two-account test |
| Private Storage policies and real CV upload                        | Runbook step 5                                    |
| Deployment to a real origin                                        | Runbook step 6 — never executed                   |
| Digest delivery with SPF, DKIM, and DMARC passing                  | Runbook step 7                                    |
| A live job source                                                  | Runbook step 8                                    |
| Full-path browser verification of every surface, including `/home` | After step 6, on the deployed origin              |

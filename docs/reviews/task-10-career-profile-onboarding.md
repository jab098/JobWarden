# Task 10 Career Profile and Onboarding Review

**Branch:** `codex/task-10-career-profile`

**Base:** Task 9 merge `44a3580`

**Local implementation head:** `b0d4da3`

**Task-slice review status:** remediation Tasks 1–3 independently passed specification and quality review with no remaining findings

**Delivery status:** active; final whole-branch review, PR #11 update/merge, local `main` update, and merge-commit verification remain pending

## Outcome

Task 10 implements the private career-profile model, bounded deterministic DOCX/PDF extraction, authenticated extraction runtime, optional schema-validated AI proposals, review repositories/actions, editorial onboarding UI, named searches, evidence/suggestion decisions, deletion controls, retention, and operations/privacy guidance.

Real CV handling remains closed at two independent boundaries:

- the web repository always returns a disabled upload capability and the UI contains no file input; and
- `private.app_settings.career_cv_uploads_enabled` defaults false and blocks upload intents, Storage inserts, CV registration, and extraction claims. Task 10 exposes no setter.

The branch must not be described as `reviewed` or delivered until the final whole-branch review of `44a3580..HEAD` is clean, PR #11 is merged to GitHub `main`, and the merge commit passes the same verification. Task 11 has not started.

## Acceptance mapping

| Outcome                        | Evidence                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flexible onboarding            | Strict domain drafts accept any non-empty combination of CV reference, role family, industry/domain, user evidence, or keyword; empty drafts fail                                                                                                                                             |
| Evidence-bound personalisation | Search saves are RPC-only, require unique skill/responsibility arrays, and intersect crafted input with the owner's confirmed matching-kind evidence; later evidence changes transactionally prune stale concepts or remove an otherwise-empty invalid search                                 |
| Separate seniority             | Current and target seniority are separate throughout domain, database, repository, UI, and named searches                                                                                                                                                                                     |
| Owner-only private data        | Career tables force RLS; profile/search writes and evidence decisions use owner-derived RPCs; private Storage uses owner paths and generation-bound upload intents; administrators have no default profile/CV visibility                                                                      |
| Safe file intake               | DOCX parsing validates central/local ZIP structure and actual output, uses namespace-aware WordprocessingML structure/visibility rules, and aborts at bounds; PDF parsing streams visible in-page text, cancels at bounds, and destroys loading/document tasks within the extraction deadline |
| Deterministic fallback         | Explicit phrase rules emit offset-backed proposed evidence and evidence-backed inactive role suggestions without raw CV text                                                                                                                                                                  |
| Optional AI ceiling            | Private owner allowance defaults to zero and is constrained to `0..25`; the durable application-wide UTC-date aggregate survives user/profile deletion; claim/renew/complete are service-only and token/lease fenced; there is no retry or paid fallback                                      |
| Explicit review                | Only the decision RPC can move proposed evidence to confirmed/rejected; successful extraction materialises reviewable records without overwriting user-confirmed evidence; decided suggestions stay visibly labelled                                                                          |
| Concurrency safety             | One durable per-owner generation mutex fences profile/search saves, evidence pruning/decisions, extraction completion, upload intent/registration, CV cleanup, and full deletion; two-session pgTAP fixtures cover first-save and save/delete races                                           |
| Retention/deletion             | Full deletion recursively inventories nested and unregistered owner Storage, unions registered paths, removes unique paths in bounded batches, verifies the prefix is empty, and only then advances the generation tombstone and deletes structured data                                      |
| Real uploads disabled          | Web capability, database setting, generation-bound upload intent, Storage policy, registration RPC, and claim RPC all retain the closed gate                                                                                                                                                  |

## Review remediation record

The original Task 10 self-review and later independent slice reviews produced three remediation commits:

1. `d1ee375` — made extraction claims, lease renewal, and completion service-role-only; added unguessable claim tokens, renewable leases, stale-run recovery, SHA-256 download binding, a streamed request cap, one overall lifecycle deadline, and the durable application-wide AI ledger with a private owner-controlled allowance.
2. `b4dd62a` — replaced metadata-trusting/regex/full-materialisation parsing with structurally validated, bounded, cancellation-aware DOCX/PDF extraction. Actual DOCX output, ZIP consistency and overlap, XML structure/visibility, PDF geometry/rendering visibility, incremental text limits, and cleanup deadlines are regression-covered.
3. `b0d4da3` — made profile/search authority owner-derived and generation-fenced; added unique evidence arrays, confirmed-evidence-only search persistence and pruning, a stable selected-search lifecycle, controlled-state clearing, complete nested/orphan Storage inventory, 15-minute generation-bound upload intents, and shared owner lock ordering with real two-session race fixtures.

Each slice received an independent specification and quality review. The Task 3 final re-review at `b0d4da3` passed with no findings. This is not the required final whole-branch review and does not change Task 10 from `active`.

## Verification evidence

Run from `/Users/jabed/Desktop/Jabed's Trash/Dev/JobWarden` on 2026-07-18:

- `pnpm install --frozen-lockfile` — passed; all five workspace projects were already current under pnpm 11.9.0;
- `pnpm verify` — passed formatting, workspace lint/typechecks, function typecheck, both Deno deployment graphs, 535 workspace tests across 43 files, 27 ingestion tests, 25 career-extraction tests, guardrails, and the Next.js production build;
- `pnpm check:supabase` — passed for 10 migrations and 20 forced-RLS tables;
- `pnpm audit --prod --audit-level high` — passed with no known vulnerabilities;
- `git diff --check origin/main...HEAD` and plain `git diff --check` — passed with no output before the documentation commit;
- `gitleaks git --no-banner --redact --log-opts='origin/main..HEAD'` — passed for 14 commits and approximately 561.19 KB with no leaks before the documentation commit;
- `NODE_ENV=production JOBWARDEN_DEV_ACCESS_BYPASS=true pnpm --filter @jobwarden/web build` — failed closed as required during prerender with `Development access bypass is forbidden outside local development`; and
- earlier hydrated `/profile` browser checks at 1440 by 1000 and true 390 by 844 passed the desktop/mobile hierarchy, navigation, visible focus, no file input, no error overlay, and no horizontal document overflow before the review-remediation wave.

The expected jsdom `HTMLCanvasElement.getContext()` notice appeared during the accessibility suite; it did not fail a test and no canvas is used by the profile feature.

## Preserved pre-live blocker

Docker, the Supabase CLI, `psql`, and `pg_prove` are unavailable in this environment. `supabase db reset`, database lint against a local stack, and pgTAP files 007 through 011 have therefore not executed against real PostgreSQL/Supabase. The static verifier and fictional fixtures do not replace that evidence. The 13-assertion `011_career_profile_concurrency.sql` includes real two-session race coverage, but it is not claimed as runtime-green.

Live approved authentication, private Storage/RLS boundary tests, fictional replacement/deletion/retention exercises, and complete erasure verification also remain pre-live gates. None of these blockers reopens real CV upload.

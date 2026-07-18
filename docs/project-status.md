# JobWarden Project Status

This file is the durable cross-session recovery map. Update task status to `reviewed` only after an independent review is clean.

## Source of truth

- [Approved foundation design](superpowers/specs/2026-07-17-jobwarden-foundation-design.md)
- [Historical Tasks 1–6 foundation plan](superpowers/plans/2026-07-17-jobwarden-foundation.md)
- [Active Task 8 implementation plan](superpowers/plans/2026-07-18-task-8-shared-ingestion-runtime.md)
- [Shipping standard](standards/shipping-standards.md)
- [UI direction](design/ui-direction.md)
- [UK source coverage strategy](product/source-coverage.md)
- [Approved personalised search design](superpowers/specs/2026-07-18-personalised-job-search-design.md)
- [Canonical Tasks 7–16 roadmap](product/roadmap.md)
- [Free-tier services and cost boundaries](architecture/free-tier-services.md)
- [Current architecture record](superpowers/specs/2026-07-17-jobwarden-foundation-design.md#architecture); dedicated architecture decision records are scheduled for Task 16 under `architecture/decisions/`

## Handoff

- Current integration branch: `main`; Task 9 is isolated in its feature worktree
- Last independently reviewed task implementation commit: `8556997`
- Branch baseline before Task 1: `7195a8f8913a7cffec08599fe114f0cbe91e976c`
- Active feature branch: `codex/task-9-uk-coverage`
- Active task: Task 9 UK coverage and compensation; authentication setup remains deferred by the owner

## Task progress

| Task                                                                   | Status   | Notes                                                         |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| 1. Monorepo, persistent standards, and invariant guardrails            | reviewed | Commits `5563920` and `dc021a6`; independent review clean     |
| 2. UK job domain and access state machine                              | reviewed | Commits `4b3a221` through `b808ce6`; independent review clean |
| 3. Greenhouse adapter and normalisation pipeline                       | reviewed | Commits `3ed0eb6` through `b570fab`; final full review clean  |
| 4. Supabase schema, RLS, mutations, and database tests                 | reviewed | Review clean; real Supabase reset/pgTAP pending Docker        |
| 5. Supabase authentication and route gates                             | reviewed | Code retained; live OAuth and operational setup deferred      |
| 6. Responsive app shell and UK jobs feed                               | reviewed | Delivered by PR #5; merge commit `7878d47` verified locally   |
| 7. Administrator operations                                            | reviewed | Delivered by PR #8; final code review clean at `4a1efdd`      |
| 8. Shared ingestion runtime                                            | reviewed | Delivered by PR #9; final code review clean at `8556997`      |
| 9. UK coverage and compensation                                        | active   | Focused design and implementation plan dated 2026-07-18       |
| 10. Career profile, onboarding, and CV extraction                      | pending  |                                                               |
| 11. Target Feed and explainable fit scores                             | pending  |                                                               |
| 12. Explore and career pathways                                        | pending  |                                                               |
| 13. Application tracker and follow-ups                                 | pending  |                                                               |
| 14. Scheduled updates and notifications                                | pending  |                                                               |
| 15. Evidence-bound CV tailoring                                        | pending  |                                                               |
| 16. Privacy, production access, deployment, and full-path verification | pending  |                                                               |

## Last verification commands

Run from the repository root:

```sh
pnpm install
pnpm vitest run --config tests/guardrails/vitest.config.ts
pnpm --filter @jobwarden/domain test
pnpm --filter @jobwarden/domain typecheck
pnpm --filter @jobwarden/ingestion test
pnpm --filter @jobwarden/ingestion typecheck
pnpm test:functions
pnpm typecheck:functions
pnpm check:deno
pnpm vitest run scripts/bootstrap-admin.test.ts scripts/verify-supabase-foundation.test.ts
pnpm check:supabase
pnpm check:guardrails
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
pnpm --filter @jobwarden/web test
pnpm audit --prod
gitleaks git --staged --no-banner --redact
git diff --check
pnpm verify
```

Task 3 passed 56 focused ingestion tests and the workspace passed 177 tests. The reviewed pipeline uses the documented read-only Greenhouse endpoint, validates the complete response before trust, retries only bounded transient failures, strips non-visible or unsafe provider content before every classifier, allowlists HTTPS application hosts, publishes only explicit UK eligibility, and hashes stable normalised content. The final independent full-diff review found no critical, important, or minor issues.

Task 4 passed 13 focused bootstrap/static-foundation tests, the static Supabase verifier, a supplementary PGlite migration and behavioural run, and the 177-test workspace verification. The final independent review found no critical or important issues. Docker was unavailable, so `supabase db reset`, local database lint, and the 21-assertion pgTAP suite have not run. Treat the data model as reviewed but not deployable until those real Supabase checks pass.

Task 5 passed 58 focused web tests and the 235-test workspace verification, including formatting, lint, typechecking, guardrails, and a production Next.js build. The final independent full-range review found no critical, important, or minor issues. Review remediation preserves the real Supabase SSR cookie/header contract, protects callback responses from caching, rejects layered redirect-encoding attacks and C0/C1 controls, enforces same-origin callback destinations, and accepts only an exact configured HTTP(S) site origin. The Google PKCE callback, injected access resolver, protected and administrator layouts, public/access/loading/error states, sign-out, and protected `/jobs` holding destination remain implemented. Desktop and true 390 px browser captures passed for the unchanged public and sign-in UI. The production dependency audit and staged secret scan were clean. Live OAuth and deployed access-boundary checks remain pending owner-configured Supabase/Google services; Task 4's real Docker-backed database checks also remain pending.

Task 6 passed independent full-range review with no remaining critical, important, or minor findings and was delivered by PR #5 at merge commit `7878d47`. The fail-closed, server-only development mode uses explicitly fictional UK fixtures and cannot enable outside `NODE_ENV=development`; production continues to use the caller's cookie-bound Supabase client and existing RLS. URL-backed filters cover employment type, working time, workplace, IR35, literal title/employer search, and stable pagination. The responsive editorial workspace provides a desktop rail, accessible mobile navigation and filter sheets, one jobs list, manual employer-site applications, job detail, and designed loading, empty, no-results, error, and not-found states without pricing, payments, AI scoring, or auto-apply. Compensation preserves minor-unit precision without inventing range semantics, IR35 labels do not reinterpret `not_applicable`, and deep out-of-range pages return directly to the last available page. Small warm-surface text meets WCAG AA contrast and valid long source tokens cannot force mobile horizontal overflow. The web suite passed 128 tests across 15 files and the workspace passed 305 tests across 23 files; lint, typecheck, axe checks, the production build, dependency audit, exact-range secret scan, and production fail-closed probe passed. Hydrated browser verification passed `/`, `/jobs`, a filtered URL, and a detail route at 1440 px and true 390 px with meaningful content, no error overlays, no console errors, no horizontal overflow, working mobile sheets, visible keyboard focus, and a 1,000-character unbroken-token regression probe. The frozen install and complete verification were repeated successfully on the merge commit. Live Supabase queries and OAuth remain intentionally unverified until the deferred service setup is resumed.

Task 7 delivered audited access decisions, lawful Greenhouse source configuration, bounded ingestion visibility, and a globally coalesced manual-ingestion request queue. Production `/admin` still requires server-derived administrator access; mutation forms cannot supply actor or role authority, exact-origin validation fails closed, and the caller-bound Supabase client remains subject to RLS/RPC checks. The separate `/development/admin-preview` uses deeply immutable fictional data, imports no production repository or mutation action, exposes no usable production privilege, and is forbidden outside exact local development mode. The editorial operations workspace passed automated accessibility coverage and true 1440 px / 390 px browser checks without horizontal document overflow or a framework error overlay. Independent review findings covering strict Origin parsing, PostgreSQL day intervals, confirmation lifecycles, stable live regions, colour contrast, and fictional fixtures were remediated; the final re-review found no remaining critical, important, or minor issues. The workspace passed 393 tests across 32 files, formatting, lint, typechecking, guardrails, a normal production build, the static four-migration/ten-forced-RLS-table Supabase check, production dependency audit, and a 51-commit Gitleaks scan. A production build with `JOBWARDEN_DEV_ACCESS_BYPASS=true` failed closed with the expected forbidden-bypass error. Docker is not installed, so the real Supabase reset and pgTAP suite—including `supabase/tests/004_admin_operations.sql`—did not run and remain mandatory before live deployment. No owner platform setup is required for the completed fictional/local Task 7 slice.

Task 8 delivered a custom-bearer-protected Supabase Edge Function, a shared scheduled/administrator queue with just-in-time claims up to a four-source invocation cap, a 120-second internal deadline, transactional job batches, five-minute leases and a three-attempt ceiling, GMT/BST-safe London scheduling, service-role-only RPCs, source-isolated Greenhouse execution, a 500-job response ceiling, a 36-assertion pgTAP specification, and a complete operations guide through PR #9. Focused function verification passed 34 tests across four files; the unchanged repository suite passed 393 tests across 32 files, for 427 automated tests total. Function typechecking, a pinned Deno 2 deployment-graph check, the five-migration static Supabase verifier, guardrails, formatting, lint, both dependency audits, the exact-range secret scan, and the production web build passed. The final independent re-review of `7df2818..8556997` found no remaining Critical, Important, or Minor issues. Docker remains unavailable, so `supabase db reset` and the real pgTAP suite through `005_shared_ingestion_runtime.sql` are still mandatory before any live source is enabled. No owner platform setup is required until the runtime is activated.

## Approved programme update

On 2026-07-18 the owner approved the personalised-search design and canonical Tasks 7–16 roadmap. The programme adds reviewed CV-derived career profiles, named searches, the Target Feed, deterministic explainable scoring, opt-in high-overlap Explore pathways, compensation provenance, application tracking, bounded weekday digests, and conservative DOCX tailoring. Free-tier ceilings, privacy boundaries, and authentication-before-real-data are permanent constraints. All unimplemented Task 7–10 sections in the old foundation plan are superseded by the focused active plan and canonical roadmap; completed Tasks 1–6 remain unchanged.

## Delivery rule

Each independently reviewed task is published by pull request, merged into GitHub `main`, and pulled into local `main` before the next task begins.

## UI workflow

Task 6 delivered the responsive shell, jobs feed, filters, and job detail experience. Tasks 7 and 10–15 extend that UI. Every UI task follows `docs/design/ui-direction.md` and loads the available design, shadcn, and React review skills recorded in `AGENTS.md`.

## Authentication deferral

The owner explicitly deprioritised authentication setup on 2026-07-17. The reviewed Task 5 code remains intact, but Docker-backed database validation, Supabase/Google connection, administrator bootstrap, and live access-boundary verification do not block fictional local delivery through Tasks 7–15. Any task that handles real user/CV data or claims a live integration must still stop at its documented setup gate; Task 16 activates and verifies production authentication before the private beta accepts real users. Local work uses the fail-closed design in `docs/superpowers/specs/2026-07-17-authentication-deferral-design.md`. No deployed environment may enable the local bypass, and no task may weaken RLS to compensate for deferred setup.

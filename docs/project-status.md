# JobWarden Project Status

This file is the durable cross-session recovery map. Update task status to `reviewed` only after an independent review is clean.

## Source of truth

- [Approved foundation design](superpowers/specs/2026-07-17-jobwarden-foundation-design.md)
- [Active implementation plan](superpowers/plans/2026-07-17-jobwarden-foundation.md)
- [Shipping standard](standards/shipping-standards.md)
- [UI direction](design/ui-direction.md)
- [UK source coverage strategy](product/source-coverage.md)
- [Current architecture record](superpowers/specs/2026-07-17-jobwarden-foundation-design.md#architecture); dedicated architecture decision records are scheduled for Task 10 under `architecture/decisions/`

## Handoff

- Current integration branch: `main`
- Last independently reviewed task commit: `3d72405bda78bd15cb9ea7730045dacd27277f9e`
- Branch baseline before Task 1: `7195a8f8913a7cffec08599fe114f0cbe91e976c`
- Active feature branch: `codex/task-6-uk-jobs-feed`
- Next task: independently review and deliver Task 6; authentication setup remains deferred by the owner

## Task progress

| Task                                                                          | Status    | Notes                                                         |
| ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| 1. Monorepo, persistent standards, and invariant guardrails                   | reviewed  | Commits `5563920` and `dc021a6`; independent review clean     |
| 2. UK job domain and access state machine                                     | reviewed  | Commits `4b3a221` through `b808ce6`; independent review clean |
| 3. Greenhouse adapter and normalisation pipeline                              | reviewed  | Commits `3ed0eb6` through `b570fab`; final full review clean  |
| 4. Supabase schema, RLS, mutations, and database tests                        | reviewed  | Review clean; real Supabase reset/pgTAP pending Docker        |
| 5. Supabase authentication and route gates                                    | reviewed  | Code retained; live OAuth and operational setup deferred      |
| 6. Responsive app shell and UK jobs feed                                      | in review | Implemented and browser-verified through local fixture mode   |
| 7. Administrator access, sources, and ingestion screens                       | pending   |                                                               |
| 8. Ingestion Edge Function and schedule                                       | pending   |                                                               |
| 9. Observability, account controls, and health reporting                      | pending   |                                                               |
| 10. Cloudflare, CI security, architecture records, and full-path verification | pending   |                                                               |

## Last verification commands

Run from the repository root:

```sh
pnpm install
pnpm vitest run --config tests/guardrails/vitest.config.ts
pnpm --filter @jobwarden/domain test
pnpm --filter @jobwarden/domain typecheck
pnpm --filter @jobwarden/ingestion test
pnpm --filter @jobwarden/ingestion typecheck
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

Task 6 is implemented on `codex/task-6-uk-jobs-feed` pending independent full-range review and delivery. The fail-closed, server-only development mode uses explicitly fictional UK fixtures and cannot enable outside `NODE_ENV=development`; production continues to use the caller's cookie-bound Supabase client and existing RLS. URL-backed filters cover employment type, working time, workplace, IR35, literal title/employer search, and stable pagination. The responsive editorial workspace provides a desktop rail, accessible mobile navigation and filter sheets, one jobs list, manual employer-site applications, job detail, and designed loading, empty, no-results, error, and not-found states without pricing, payments, AI scoring, or auto-apply. The web suite passed 126 tests across 15 files; lint, typecheck, axe checks, and the production build passed. Browser verification passed `/`, `/jobs`, a filtered URL, and a detail route at 1440 px and true 390 px with meaningful content, no error overlays, no console errors, no horizontal overflow, working mobile sheets, and visible keyboard focus. Live Supabase queries and OAuth remain intentionally unverified until the deferred service setup is resumed.

## Delivery rule

Each independently reviewed task is published by pull request, merged into GitHub `main`, and pulled into local `main` before the next task begins.

## UI workflow

Real product UI begins with the authentication and pending-access experience in Task 5. Task 6 delivers the responsive app shell, jobs feed, filters, and job detail experience. Both tasks must follow `docs/design/ui-direction.md` and load the available design, shadcn, and React review skills recorded in `AGENTS.md`.

## Authentication deferral

The owner explicitly deprioritised authentication setup on 2026-07-17. The reviewed Task 5 code remains intact, but Docker-backed database validation, Supabase/Google connection, administrator bootstrap, and live access-boundary verification no longer block Tasks 6–10. Local work uses the fail-closed design in `docs/superpowers/specs/2026-07-17-authentication-deferral-design.md`. No deployed environment may enable the local bypass, and no task may weaken RLS to compensate for deferred setup.

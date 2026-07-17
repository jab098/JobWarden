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
- Last independently reviewed task commit: `757d79361000f5ee7a32a53372e9509e69cfc3de`
- Branch baseline before Task 1: `7195a8f8913a7cffec08599fe114f0cbe91e976c`
- Next task: Task 5, add Supabase authentication, pending access, and server-side route gates

## Task progress

| Task                                                                          | Status   | Notes                                                         |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| 1. Monorepo, persistent standards, and invariant guardrails                   | reviewed | Commits `5563920` and `dc021a6`; independent review clean     |
| 2. UK job domain and access state machine                                     | reviewed | Commits `4b3a221` through `b808ce6`; independent review clean |
| 3. Greenhouse adapter and normalisation pipeline                              | reviewed | Commits `3ed0eb6` through `b570fab`; final full review clean  |
| 4. Supabase schema, RLS, mutations, and database tests                        | reviewed | Review clean; real Supabase reset/pgTAP pending Docker        |
| 5. Supabase authentication and route gates                                    | pending  |                                                               |
| 6. Responsive app shell and UK jobs feed                                      | pending  |                                                               |
| 7. Administrator access, sources, and ingestion screens                       | pending  |                                                               |
| 8. Ingestion Edge Function and schedule                                       | pending  |                                                               |
| 9. Observability, account controls, and health reporting                      | pending  |                                                               |
| 10. Cloudflare, CI security, architecture records, and full-path verification | pending  |                                                               |

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
git diff --check
pnpm verify
```

Task 3 passed 56 focused ingestion tests and the workspace passed 177 tests. The reviewed pipeline uses the documented read-only Greenhouse endpoint, validates the complete response before trust, retries only bounded transient failures, strips non-visible or unsafe provider content before every classifier, allowlists HTTPS application hosts, publishes only explicit UK eligibility, and hashes stable normalised content. The final independent full-diff review found no critical, important, or minor issues.

Task 4 passed 13 focused bootstrap/static-foundation tests, the static Supabase verifier, a supplementary PGlite migration and behavioural run, and the 177-test workspace verification. The final independent review found no critical or important issues. Docker was unavailable, so `supabase db reset`, local database lint, and the 21-assertion pgTAP suite have not run. Treat the data model as reviewed but not deployable until those real Supabase checks pass.

## Delivery rule

Each independently reviewed task is published by pull request, merged into GitHub `main`, and pulled into local `main` before the next task begins.

## UI workflow

Real product UI begins with the authentication and pending-access experience in Task 5. Task 6 delivers the responsive app shell, jobs feed, filters, and job detail experience. Both tasks must follow `docs/design/ui-direction.md` and load the available design, shadcn, and React review skills recorded in `AGENTS.md`.

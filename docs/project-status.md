# JobWarden Project Status

This file is the durable cross-session recovery map. Update task status to `reviewed` only after an independent review is clean.

## Source of truth

- [Approved foundation design](superpowers/specs/2026-07-17-jobwarden-foundation-design.md)
- [Active implementation plan](superpowers/plans/2026-07-17-jobwarden-foundation.md)
- [Shipping standard](standards/shipping-standards.md)
- [Current architecture record](superpowers/specs/2026-07-17-jobwarden-foundation-design.md#architecture); dedicated architecture decision records are scheduled for Task 10 under `architecture/decisions/`

## Handoff

- Current branch: `codex/jobwarden-foundation`
- Last independently reviewed task commit: `b808ce6d4cbb2489616129a8e5bba5b80115456c`
- Branch baseline before Task 1: `7195a8f8913a7cffec08599fe114f0cbe91e976c`
- Next task: Task 3, implement the Greenhouse adapter and normalisation pipeline

## Task progress

| Task                                                                          | Status   | Notes                                                         |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| 1. Monorepo, persistent standards, and invariant guardrails                   | reviewed | Commits `5563920` and `dc021a6`; independent review clean     |
| 2. UK job domain and access state machine                                     | reviewed | Commits `4b3a221` through `b808ce6`; independent review clean |
| 3. Greenhouse adapter and normalisation pipeline                              | pending  | Next task                                                     |
| 4. Supabase schema, RLS, mutations, and database tests                        | pending  |                                                               |
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
pnpm check:guardrails
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
git diff --check
pnpm verify
```

Task 2 passed 112 focused domain tests and the workspace passed 121 tests. The reviewed rules require explicit UK work eligibility, resolve contradictory evidence fail-closed, keep IR35 unknown without explicit wording, parse compensation atomically in minor units, reject mixed currencies, and enforce the complete private-access transition matrix. Independent review found no critical, important, or minor issues.

# JobWarden Project Status

This file is the durable cross-session recovery map. Update task status to `reviewed` only after an independent review is clean.

## Source of truth

- [Approved foundation design](superpowers/specs/2026-07-17-jobwarden-foundation-design.md)
- [Active implementation plan](superpowers/plans/2026-07-17-jobwarden-foundation.md)
- [Shipping standard](standards/shipping-standards.md)
- [Current architecture record](superpowers/specs/2026-07-17-jobwarden-foundation-design.md#architecture); dedicated architecture decision records are scheduled for Task 10 under `architecture/decisions/`

## Handoff

- Current branch: `codex/jobwarden-foundation`
- Last independently reviewed task commit: `dc021a6eaeab0dba4a7ec5b20022d66549d036ee`
- Branch baseline before Task 1: `7195a8f8913a7cffec08599fe114f0cbe91e976c`
- Next task: Task 2, implement the UK job domain and access state machine with tests

## Task progress

| Task                                                                          | Status   | Notes                                                     |
| ----------------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| 1. Monorepo, persistent standards, and invariant guardrails                   | reviewed | Commits `5563920` and `dc021a6`; independent review clean |
| 2. UK job domain and access state machine                                     | pending  | Next task                                                 |
| 3. Greenhouse adapter and normalisation pipeline                              | pending  |                                                           |
| 4. Supabase schema, RLS, mutations, and database tests                        | pending  |                                                           |
| 5. Supabase authentication and route gates                                    | pending  |                                                           |
| 6. Responsive app shell and UK jobs feed                                      | pending  |                                                           |
| 7. Administrator access, sources, and ingestion screens                       | pending  |                                                           |
| 8. Ingestion Edge Function and schedule                                       | pending  |                                                           |
| 9. Observability, account controls, and health reporting                      | pending  |                                                           |
| 10. Cloudflare, CI security, architecture records, and full-path verification | pending  |                                                           |

## Last verification commands

Run from the repository root:

```sh
pnpm install
pnpm vitest run --config tests/guardrails/vitest.config.ts
pnpm check:guardrails
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
git diff --check
pnpm verify
```

The focused guardrail suite passed 9/9 tests. RED/GREEN evidence covers both the required `UK-only` invariant and the root-manifest forbidden-dependency regression. Independent re-review found no critical, important, or minor issues.

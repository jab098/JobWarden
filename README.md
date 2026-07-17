# JobWarden

JobWarden is a private-beta, UK-only job-search command centre. The approved product scope and invariants live in the [foundation design](docs/superpowers/specs/2026-07-17-jobwarden-foundation-design.md).

## Local development

Use Node 24.18.0 and pnpm 11.7.0:

```sh
pnpm install
pnpm --filter @jobwarden/web dev
```

Copy `.env.example` to `.env.local` and supply credentials locally. Never commit environment files or real secrets.

`SUPABASE_SERVICE_ROLE_KEY`, `INGESTION_CRON_SECRET`, `SENTRY_AUTH_TOKEN`, and `ADMIN_BOOTSTRAP_USER_ID` are server-only. Never prefix them with `NEXT_PUBLIC_`, expose them to client components, or include them in browser logs.

## Verification

Run the complete repository verification with:

```sh
pnpm verify
```

The persistent shipping standard is in [docs/standards/shipping-standards.md](docs/standards/shipping-standards.md), and the current recovery map is in [docs/project-status.md](docs/project-status.md).

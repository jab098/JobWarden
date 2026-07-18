# JobWarden

JobWarden is a private-beta, UK-only job-search command centre. The approved foundation lives in the [foundation design](docs/superpowers/specs/2026-07-17-jobwarden-foundation-design.md); the approved personalisation experience lives in the [personalised search design](docs/superpowers/specs/2026-07-18-personalised-job-search-design.md).

The durable recovery map is [project status](docs/project-status.md), Tasks 7–16 are defined in the [canonical product roadmap](docs/product/roadmap.md), and provider/cost decisions are maintained in [free-tier services](docs/architecture/free-tier-services.md). Future agents should read those files before choosing work.

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

The persistent shipping standard is in [docs/standards/shipping-standards.md](docs/standards/shipping-standards.md). The default architecture remains free-tier-first with hard cost ceilings and no automatic paid AI fallback; service-specific setup is documented only when its task reaches a live integration gate.

Task 8's shared Supabase ingestion runtime, local checks, hosted activation, secret rotation, pause/retry, and recovery procedures are in the [ingestion operations guide](docs/operations/ingestion.md). No Supabase account setup is required to continue fixture development; complete that guide before enabling a live source.

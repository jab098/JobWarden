# Authentication Deferral and Local Product Development

**Status:** Approved by the owner on 2026-07-17

## Decision

JobWarden's reviewed Supabase authentication, manual approval, route gates, and RLS policies remain in the repository, but connecting and operating authentication is no longer a prerequisite for building the remaining product tasks. Authentication setup is deferred until the owner chooses to reactivate it.

Development continues through an explicitly enabled, server-only local access mode:

- `JOBWARDEN_DEV_ACCESS_BYPASS=true` is honoured only when `NODE_ENV=development`.
- Setting the flag in any other environment fails closed with a configuration error.
- The flag is never exposed with a `NEXT_PUBLIC_` prefix.
- The bypass may open the ordinary jobs workspace locally. It never grants an administrator role and never weakens database RLS.
- Supabase remains the production repository. Local development uses a fixture-backed implementation behind the same jobs repository interface.
- Local fixture listings are visibly identified as development data and cannot be selected outside the development bypass.

## Why this approach

Deleting authentication would discard reviewed work and make reactivation expensive. Making jobs publicly readable would require changing RLS and the product's private-beta boundary. A fail-closed local seam lets the product UI and workflows progress while preserving both.

## Route and data behaviour

When the local bypass is disabled, existing behaviour remains unchanged: the session-refresh proxy runs, protected layouts require an approved user, and Supabase RLS is authoritative.

When the local bypass is enabled:

1. the session proxy does not require Supabase public environment values;
2. the ordinary protected layout renders without an authenticated identity;
3. `/jobs` and `/jobs/[jobId]` use the development repository;
4. the interface shows a restrained `Development data` indicator;
5. `/admin` continues to require the reviewed administrator guard.

The public home page links directly to the jobs workspace in this mode. Authentication, pending-access, and sign-out UI remain available in the codebase for later reactivation.

## Reactivation gate

Before authentication or real user access is enabled, the owner must complete:

- Docker-backed Supabase reset, lint, and pgTAP checks;
- Supabase and Google OAuth configuration;
- remote migrations and administrator bootstrap;
- live pending, approved, rejected, suspended, administrator, sign-out, and direct-RLS verification;
- removal of the local bypass flag from deployed environment configuration.

No remaining product task may claim those checks are complete merely because it can run through local development mode.

# Task 5 implementation report

## Outcome

Implemented the private-beta authentication and access UX on `codex/task-5-private-beta-auth` without pushing or opening a pull request.

The web app now has:

- public-only environment validation that accepts Supabase publishable keys and never reads a service-role credential;
- current `@supabase/ssr` browser/server clients and a cookie-refresh-only Next.js proxy;
- a Google OAuth Server Action and PKCE callback using the configured site origin;
- safe relative callback redirects with an injected, unit-tested access resolver;
- verified-user access lookups, protected and administrator layouts, and RLS documented as the final boundary;
- designed public, sign-in, pending, rejected, suspended, closed, loading, error, sign-out, administrator, and protected `/jobs` holding states;
- a Supabase/Google setup and first-administrator guide; and
- explicit Reed, LinkedIn, Indeed, and Glassdoor source-permission status without adding adapters.

## TDD evidence

Each new behavior began with a focused failing test before the smallest implementation needed to pass it.

| Slice | Red evidence | Green evidence |
| --- | --- | --- |
| Public environment separation | Missing module, then three schema assertions failed against the initial stub | Three environment tests passed, including rejection of secret keys and omission of service-role input |
| Injected access resolution | Nine access cases failed before the resolver existed | Unauthenticated, pending, rejected, suspended, approved, administrator, and safe-404 cases passed |
| Safe callback paths | Eleven redirect assertions failed before validation existed | All relative-path and fallback cases passed |
| Google PKCE flow | Three OAuth expectations failed before implementation | Provider, configured-origin callback, exchange, generic failure, and safe destination cases passed |
| Cookie refresh proxy | Initial proxy test failed with `Not implemented` | Claims refresh, cookie propagation, and no authorization redirect passed |
| Authentication/access UI | Six state tests failed while components returned no UI | Public, sign-in, pending, rejected, suspended, and closed states passed |
| Protected UI | Three loading/error/holding tests failed before components existed | All three passed with semantic recovery/status text and no fake job data |
| Supabase access repository | Three repository tests failed with `Not implemented` | Verified-user, own-row, status validation, RPC, and generic error behavior passed |
| Real SSR `setAll` contract regression | `TypeError: Cannot convert undefined or null to object` when the factory invoked `setAll(cookies)` | Focused proxy test and TypeScript check passed after matching the one-argument SSR API |

Final focused web result: 7 files, 41 tests passed.

## Verification evidence

The final post-fix verification run used safe placeholder public values only:

```sh
NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder_for_local_verification \
pnpm verify
```

Result:

- Prettier: passed
- ESLint: passed
- workspace TypeScript: passed
- workspace Vitest: 15 files, 218 tests passed
- project guardrails: passed
- Next.js production build: passed for `/`, `/access/pending`, `/admin`, `/auth/callback`, `/auth/sign-in`, and `/jobs`

Additional checks:

- `pnpm --filter @jobwarden/web test`: 7 files, 41 tests passed
- focused proxy regression test plus web typecheck: passed
- `git diff --check`: passed
- `pnpm audit --prod`: no known vulnerabilities after pinning the transitive PostCSS resolution to `8.5.19`
- `gitleaks git --staged --no-banner --redact`: no leaks in 88.78 KB of staged changes
- lockfile supply-chain policy: passed; the explicitly required Supabase `2.110.7` family is allowlisted from the minimum-release-age hold

## Browser verification

Used a safe local development configuration with no real credentials.

- Public page: 1440 x 1000 visual pass
- Sign-in page: 1440 x 1000 visual pass
- Public page: true CDP-emulated 390 x 844 visual pass
- Sign-in page: true CDP-emulated 390 x 844 visual pass
- Both mobile pages measured `innerWidth = clientWidth = scrollWidth = 390`, confirming no horizontal overflow

The public and sign-in pages preserve the approved warm-neutral, editorial direction, use Geist, retain one blue action colour, and avoid gradients, card grids, pricing language, fake data, or automatic-access implications. Protected state variants were verified through injected React fixtures because real accounts and Supabase credentials were intentionally unavailable.

## Security and boundary review

- The browser client imports only URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- No legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted.
- `SUPABASE_SERVICE_ROLE_KEY` remains a bootstrap compatibility name and is explicitly prohibited from `apps/web/.env.local`.
- OAuth callback origins come from validated configuration, never request `Host` headers.
- Callback destinations reject protocol-relative paths, backslashes, control characters, and non-relative URLs.
- Session proxy work is cookie refresh only; server layouts and RLS enforce access.
- Access lookup begins with `auth.getUser()`, scopes the row query to the verified user ID, and checks administrator state through the server-controlled database RPC.
- Authentication alone grants no protected product data.
- Generic errors do not expose provider payloads, tokens, or email addresses.
- Source coverage records forbid scraping LinkedIn, Indeed, and Glassdoor without the stated authorization.

## Remaining concerns and user-owned setup

- Live Google OAuth cannot be completed without a user-configured Supabase project, Google OAuth client, callback allowlist, migrations, and public local/deployment values. No credentials were requested or stored.
- Task 4's Docker-backed `supabase db reset`, database lint, and pgTAP verification remain pending; the authentication UX does not make that database foundation deployable.
- Next.js emits the existing worktree-only root-inference warning because both the main checkout and linked worktree contain workspace lockfiles; the build itself succeeds.
- Task 5 is marked implemented, not reviewed. An independent review is still required before merge and before Task 6 starts under the delivery rule.

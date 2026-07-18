# Task 7 Administrator Operations Review

## Outcome

Task 7 is independently reviewed with no remaining Critical, Important, or Minor findings and is delivered through GitHub pull request #8.

Reviewed implementation range: `b70c1b9..4a1efdd`.

## Delivered

- Domain validation for allowlisted Greenhouse sources, review dates, hosts, cadence, and manual-run identifiers.
- A database-enforced 15-minute minimum cadence and administrator-readable `ingestion_requests` queue.
- An authenticated, audited, globally coalesced `request_source_ingestion(uuid)` RPC that never performs provider fetching in a web request.
- Caller-bound Supabase reads and RPC mutations with target-only form data, fixed public errors, and exact same-origin mutation validation.
- Protected `/admin/access`, `/admin/sources`, and `/admin/ingestion` routes with loading/error states and confirmed mutations.
- A separate, immutable, read-only `/development/admin-preview` whose data and links remain fictional/local and whose guard fails closed outside development.
- A responsive editorial operations UI with accessible confirmations, stable live results, compliant small-text contrast, and mobile definition-list layouts.

## Independent review and remediation

The first independent review found strict-origin normalisation gaps, day-only PostgreSQL interval handling, a missing source-state confirmation, insufficient small-text contrast, an unstable access-decision live result, a literal NUL in the origin file, non-fictional preview host data, and two copy/test coverage gaps. Those findings were fixed in `cacf9bb`.

The second review found incomplete modal lifecycles. Commit `4a1efdd` now validates source forms before opening confirmation, focuses the first invalid field, controls modal closure after every server result, presents success/error feedback outside the closed modal, and keeps access outcomes in a stable parent live region across a pending-to-approved rerender. The final independent re-review was clean.

## Verification evidence

- `pnpm install --frozen-lockfile`: passed; lockfile already current.
- `pnpm verify`: passed after final remediation.
- Workspace tests: 393 passed across 32 files.
- Focused administrator UI: 179 web tests passed after lifecycle remediation.
- Formatting, ESLint, TypeScript, guardrails, and normal Next.js production build: passed.
- `pnpm check:supabase`: passed static verification for 4 migrations and 10 forced-RLS tables.
- `NODE_ENV=production JOBWARDEN_DEV_ACCESS_BYPASS=true pnpm --filter @jobwarden/web build`: failed closed with `Development access bypass is forbidden outside local development` as designed.
- `pnpm audit --prod`: passed with no known vulnerabilities. One repeat attempt encountered transient npm-registry DNS failure and the immediate isolated retry passed.
- `gitleaks git --no-banner --redact`: passed; 51 commits and approximately 1.06 MB scanned with no leaks.
- Forbidden pricing/payment/auto-apply scan: no matches in Task 7 routes or components.
- Client-authority scan: matches exist only in adversarial tests that prove submitted `actorId`/`isAdmin` fields are ignored.
- `git diff --check`: passed.

## Browser evidence

The fictional preview returned HTTP 200 and was inspected in hydrated local development at 1440 × 1100 and a Chrome DevTools Protocol-emulated true 390 × 844 CSS-pixel viewport.

- Meaningful access, source, request, and run content rendered.
- The fictional read-only boundary remained visible.
- Document `scrollWidth` equalled viewport width at both sizes.
- No Next.js error overlay was present and server logs showed no rendering or hydration error.
- Mobile heading, banner, controls, long IDs, and metadata wrapped without horizontal document overflow.
- Preview navigation stays inside the preview and cannot invoke protected administrator routes.
- Every preview control is disabled and no form action is rendered.

Access/source confirmation lifecycle and live-region behaviour were verified through focused hydrated component tests because the safe preview intentionally renders those controls inert.

## Unrun database verification

Docker is not installed in the local environment. Therefore these commands did **not** run:

```sh
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest db test
```

The real Supabase migration execution and pgTAP suite, including `supabase/tests/004_admin_operations.sql`, remain mandatory before any live deployment. The passing static verifier does not replace this gate.

## External setup and next task

No owner platform setup is required for this completed fictional/local slice.

Task 8 is next: connect the shared ingestion package and Task 7 request queue to the bounded ingestion runtime. Local implementation can begin without an account change; a Supabase project is required only when the runtime is deployed or tested against live infrastructure. Authentication and administrator bootstrap remain deferred until the documented real-data/production gate.

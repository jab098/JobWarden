# Task 9 UK Coverage and Compensation Review

## Outcome

Task 9 is independently reviewed with no remaining Critical, Important, or Minor findings. Publication to GitHub remains pending because the current execution environment cannot reach the private repository with a valid credential.

Reviewed implementation range: `49128ca..5d53b7f`.

## Delivered

- A credential-ready Reed Jobseeker API adapter that remains disabled until the owner completes the documented terms, credential, database, and controlled-smoke-test gates.
- Complete-versus-incremental coverage semantics so an absent Reed search result cannot close a previously seen job.
- Canonical jobs with separately retained provider occurrences, exact-key deduplication, deterministic winner selection, and safe rematerialisation when a provider occurrence moves or is removed.
- Advertised, estimated, and unknown compensation provenance throughout ingestion, persistence, filtering, job cards, job detail, and administrator coverage reporting.
- URL-backed compensation filtering that includes unknown compensation by default.
- Administrator source-health visibility derived from each provider occurrence rather than the selected canonical display row.
- A Reed operations guide covering activation, cadence, smoke validation, pause, key rotation, failure recovery, and provider-data removal without deleting historical run audit records.

## Independent review and remediation

The first review identified a Greenhouse-only queue, ambiguous salary parsing, undocumented provider ordering, unsafe canonical URL precedence, incomplete canonical winner precedence, structured-null compensation fallback, source-health gaps, and an impossible source-row deletion procedure. Those findings were remediated in `0749b02`.

The second review identified the legacy provider identity constraint, history-wide finalisation work, canonical rather than occurrence-based source metrics, and a disabled-source persistence race. Those findings were remediated in `a018e1e` with locking and source-state rechecks, affected-job-only finalisation, provider-occurrence aggregation, and canonical-key move coverage.

The final Minor coverage finding was remediated in `5d53b7f`. The pgTAP specification now calls the source-health RPC with deliberately conflicting provider facts and executes the documented Reed removal/rematerialisation/tombstone path. The final independent re-review found no remaining issue of any severity.

## Verification evidence

- Workspace Vitest: 409 tests passed across 33 files.
- Edge Function Vitest: 40 tests passed across 4 files.
- Formatting, ESLint, all TypeScript checks, Deno deployment-graph check, project guardrails, and static Supabase verification: passed.
- `pnpm check:supabase`: passed for 6 migrations and 11 forced-RLS tables.
- `supabase/tests/006_uk_coverage_compensation.sql`: exactly 59 assertions for `plan(59)` by static count and independent inspection.
- Network-isolated Next.js Webpack production build with mocked Google font responses: passed compilation, TypeScript, page-data collection, static generation, and trace collection.
- Standard Next.js production build reached compilation and failed only because this sandbox could not reach Google Fonts.
- `gitleaks git . --log-opts="origin/main..HEAD" --no-banner --redact`: passed across the complete Task 9 range with no leaks.
- `git diff --check origin/main...HEAD`: passed.
- Independent final review: clean.

## Environment-blocked checks

Docker and the Supabase CLI are unavailable, so the real migration execution and pgTAP suite did not run. They remain mandatory before Reed or another real source is enabled:

```sh
pnpm dlx supabase@latest start
pnpm dlx supabase@latest db reset
pnpm dlx supabase@latest test db
```

The npm production dependency audit could not reach the registry (`ENOTFOUND`). The standard build could not fetch Google-hosted Geist fonts. Hydrated browser verification could not start a local listener in this sandbox; automated component, interaction, responsive, and axe coverage passed instead. These environment failures do not replace the blocked checks, which must be rerun in CI or an unrestricted checkout.

## External setup and next task

No Reed credential is needed to merge the disabled connector. When activation is appropriate, follow `docs/operations/reed-ingestion.md`; keep the key in Supabase secrets and never paste it into an agent chat or commit it.

Task 10 follows after Task 9 is published: implement fictional-data career-profile onboarding and deterministic CV extraction boundaries. Real CV upload remains disabled until private Supabase Storage, authentication, RLS, and Cloudflare Workers AI limits have been configured and verified.

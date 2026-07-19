# Task 20 Administrator Audit Log and Operational Health Review

**Branch:** `codex/task-20-admin-observability`

**Base:** `main` after the Task 19 publication record

**Review status:** independent review complete; one real defect found and fixed during implementation.

## Outcome

Three datasets existed in the database with no way to read them: the audit log, written since Task 1; the AI usage ledger, written since Task 10; and notification delivery records, visible only to the individual owner rather than to the administrator responsible for the free-tier ceiling. This task gives all three a surface, and **collects nothing new**.

`list_audit_log` is bounded (1–200 entries), paginated by timestamp, and checks administrator status **before** validating the page size — so the bound cannot be probed by a non-administrator. Metadata is returned as stored; the writers already exclude CV text, job descriptions, request bodies, and tokens.

`admin_operational_health` counts deliveries with `status in ('pending','sent')` — **exactly as the send path counts them** — so the headroom shown is the headroom the runtime will actually apply, not a second, more optimistic estimate. It reports the AI daily allowance beside its usage, and the interface states that a zero allowance is the configured default rather than a fault.

Both surfaces are read-only by construction, asserted by tests that check the rendered output contains no button, form, or input. The audit trail is evidence; a surface that could edit it would not be.

## Defect found during implementation

The health function initially read the AI allowance from `public.app_settings`. That table does not exist — the setting lives in `private.app_settings`, keyed by a `singleton` column. The function would have failed at runtime on a surface with no other way to be exercised before deployment. Caught by reading the Task 10 migration rather than trusting the name.

## Accepted, recorded observations

- The delivery limits shown are the notification runtime's defaults (80 daily, 2,500 monthly), mirrored in the web repository. If the owner overrides them in the Edge Function environment, both places must change. This is called out in a comment beside the constant; deriving them from one source would mean the web app reading Edge Function secrets, which is worse.
- The audit page shows the 50 most recent entries with no "load more" control yet. The RPC already accepts a `before` cursor, so adding one changes no contract.
- Both reads are granted to `authenticated` and re-check administrator status inside the function. That is the existing pattern in this codebase: the grant is coarse, the function is the boundary, and pgTAP asserts a non-administrator is refused.

## Acceptance mapping

| Roadmap criterion                                                                                            | Evidence                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The audit log is read-only, paginated, and bounded, with no CV text or user content                          | Page size is capped at 200 and validated; the table renders no interactive control, asserted by test; metadata comes from writers that already exclude sensitive content. |
| Delivery health shows sent, suppressed, and failed with remaining headroom, from the rows the runtime writes | Counted from `career_notification_deliveries` including in-flight rows, matching the send path's own arithmetic; headroom is shown alongside consumption.                 |
| AI usage shows consumption against the ceiling, including when it is zero                                    | Both figures are shown, and a zero allowance is explained as the default rather than displayed as a bare zero.                                                            |
| Every figure is derived, never estimated, and no mutation path is added                                      | Every number comes from a count over existing rows; both components render no button or form.                                                                             |

## Verification evidence

- `pnpm verify` passed: 1,081 workspace tests across 82 files, plus 130 function tests — 1,211 automated tests total.
- `pnpm check:supabase`: 19 migrations, 32 forced-RLS tables.
- `pnpm audit --prod`: no known vulnerabilities. No dependency was added.
- `git diff --check` clean; Gitleaks found no leaks.
- Browser verification of the fictional administrator preview, which now carries both surfaces so they stay reviewable without real administrator access: no document overflow at 1440 px or true 390 px, no console errors in a fresh tab, the audit table rendering its rows, and the health figures showing headroom and the zero-allowance explanation.

## Environment limitations

- Docker is unavailable, so pgTAP file `020_admin_observability.sql` (9 assertions) is statically verified only.
- The real `/admin/audit` and `/admin/health` pages have never been rendered against a live administrator session, because `/admin` has no development bypass by design. They are exercised through the fictional preview and through component tests.

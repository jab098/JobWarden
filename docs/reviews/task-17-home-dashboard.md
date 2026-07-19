# Task 17 Home Activity Dashboard Review

**Branch:** `codex/task-17-home-dashboard`

**Base:** `main` at `3299b67` (Task 15 publication record)

**Review status:** independent review complete; the finding was remediated at `HEAD` with a clean re-run of the full gate.

## Outcome

`/home` gives the signed-in user an at-a-glance summary of their own job search. It required **no schema change**: every figure is counted from rows JobWarden already had a reason to store, which is what the acceptance criterion "no new analytics collection" demands.

`packages/domain/src/dashboard.ts` is pure and deterministic. `countByLondonDay` buckets timestamps into zero-filled `Europe/London` calendar days, so a quiet day reads as zero rather than vanishing from a series. `comparePeriods` compares two equal windows and returns `no_baseline` when the previous window is empty — "up from nothing" is not a trend, and reporting one would fabricate a comparison the data cannot support. `buildDashboard` delegates the application funnel and outcome split to the tracker's own `buildApplicationInsights`, so the dashboard cannot disagree with `/applications`; silence stays "no stage change for 14+ days" and is never converted into a rejection.

Two deliberate honesty choices sit in the domain module. The Target Feed trend is derived from `jobs.first_seen_at` — the day JobWarden first indexed each currently matching job — because there is no match-history table and adding one would be exactly the new collection this page may not introduce; the UI says "By the day JobWarden first saw each job" rather than implying discovery tracking. And `topProfileName` returns null on a tie instead of picking a winner the data does not support.

The web layer reuses existing surfaces rather than re-deriving their numbers: `readApplicationRecords` and `toDashboardApplications` were extracted from the tracker so both read the same rows through the same audited derivation, the match count comes from the Target Feed repository itself, and the qualifying-pathway count comes from the Explore repository. An application's creation time is its earliest audited event, which the tracking RPC always writes, so no column was added.

`/home` is read-only: a test asserts the rendered output contains no `form`, `button`, or `input` at all. Sparklines are inline SVG with accessible names — a charting dependency would be a lot of bytes for seven bars, and the roadmap requires separate approval for one. Home joined the desktop rail and the mobile sheet.

## Independent review remediation

One finding, fixed at `HEAD`:

**The Explore qualifying count was hardcoded to zero in production while the fixture showed two (important).** The Supabase repository set `qualifyingCount: 0` with a comment deferring the computation, so a real user with qualifying pathways would have been told they had none — a false statement of exactly the kind this task's acceptance forbids — and the development fixture's value of 2 hid it from review. The repository now calls the Explore repository and reports the number Explore itself would show, with tests covering both the enabled count and the disabled state.

A layout correction also came out of review: a search-profile _name_ was being typeset at statistic size, giving a string the visual weight the number slots have earned.

Accepted, recorded observations:

- The dashboard is the heaviest read in the product: it runs the Target Feed computation, the Explore evaluation, the application and event reads, and the profile snapshot in one request. That is acceptable at private-beta scale and is the price of every figure agreeing with the surface it links to, rather than being a second, cheaper, divergent estimate.
- A currently matching job whose `first_seen_at` could not be read is left out of the trend rather than placed on an arbitrary day. The current match count still reflects the feed.
- The window is fixed at 7 days. A user-selectable window is a straightforward addition once there is a reason to want one.

## Acceptance mapping

| Roadmap criterion                                                                                 | Evidence                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every figure derives from the owner's own rows; no cross-user data, no CV text, no new collection | No migration was added. Reads go through existing owner-only repositories and RLS-protected tables; a domain test asserts no description or excerpt field reaches the result.     |
| Comparison windows are deterministic and label short histories honestly                           | `comparePeriods` returns `no_baseline` for an empty previous window, and the UI renders "not enough history to compare" rather than a percentage.                                 |
| Unknown/ghosted outcomes stay distinct and are never implied rejections                           | The outcome split comes from the tracker's audited builder; the UI labels it "no response observed in 14+ days" and never uses rejection wording for silence.                     |
| The dashboard is read-only and links out for action                                               | A test asserts zero forms, buttons, and inputs in the rendered output; every section links to `/jobs`, `/applications`, `/explore`, or `/profile`.                                |
| Keyboard and mobile accessible, follows the UI direction, sparklines without a dependency         | axe checks pass; sparklines are inline SVG with `role="img"` and accessible names; quiet neutral surfaces and state dots only; verified at true 390 px with no document overflow. |
| The fictional preview serves frozen statistics and refuses mutations                              | The development repository builds from a fixed clock so the preview renders identically every time, and the surface has no mutation path to refuse.                               |

## Verification evidence

- `pnpm verify` passed on the remediated head: 958 workspace tests across 76 files, plus 130 function tests — 1,088 automated tests total. The domain package contributes 286.
- `pnpm check:supabase`: 15 migrations, 31 forced-RLS tables — unchanged, because this task adds no schema.
- `pnpm audit --prod`: no known vulnerabilities. No dependency was added.
- `git diff --check` clean; Gitleaks over the staged range found no leaks.
- Browser verification in the exact local development bypass: `/home` at 1440 px and true 390 px with no document overflow and no console errors in a fresh tab, both sparklines rendering, and Home active in the navigation rail.

## Environment limitations

- The Supabase repository has been exercised against stubbed clients only; like every other surface, its live behaviour waits on the deferred platform setup.
- Task 16's full-path verification must cover `/home`, since this task landed before it — as the roadmap anticipated.

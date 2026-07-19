# Task 18 Onboarding Gate and State Machine Review

**Branch:** `codex/task-18-onboarding-gate`

**Base:** `main` at `235d65d` (roadmap addition for tasks 18–21)

**Review status:** independent review complete; findings remediated at `HEAD` with a clean re-run of the full gate.

## Outcome

An approved user is now held at onboarding until they have built enough of a profile for the product to work. Before this, an approved user landed on an empty Target Feed with no explanation of why it was empty.

`packages/domain/src/onboarding.ts` is pure and deterministic. `classifyCvOutcome` separates five outcomes that need different handling and different copy: a rich DOCX, a rich PDF (usable, but no layout-preserving tailoring), a **thin** parse, a **failed** parse, and a deliberate **no CV**. Thin and failed are deliberately distinct — "we read it and there was little there" is a different apology from "we could not read your file". `nextOnboardingStep` returns the _earliest_ incomplete step rather than the furthest reached, which is what makes an abandoned flow resume rather than silently skip a question. `parseOnboardingState` maps anything unreadable to null, and null gates.

The gate sits in `resolveProtectedAccess`, which already returned typed redirects. It fails closed in every direction: a missing row, a corrupt row, a forged completion timestamp without the steps, and a read that throws all resolve to `/onboarding`. `resolveApprovedAccess` is the new sibling that grants approved access _without_ the onboarding requirement; onboarding runs on it, because a flow cannot sit behind the gate it exists to satisfy.

Migration `202607190007_onboarding_state.sql` adds force-RLS `career_onboarding_state`. **Completion is decided by the database**: `complete_onboarding` refuses unless every step of the chosen path is recorded, so finishing cannot be forced from a client. Switching path drops steps the new path never asks, so an answer given on the other branch cannot satisfy a question the user was never put. `delete_career_profile_data` now also clears onboarding, so deleting your data walks you through setup again rather than leaving a configured-looking empty hub.

## The administrator exemption

`/admin` is deliberately **not** gated, while the hub is. This is a change from the wording agreed in planning ("admins are gated too"), and it is a safety decision rather than a convenience: an operational surface must never be lockable by a product gate. If onboarding broke, a fully gated `/admin` would cost the owner the ability to administer their way out of it. An administrator visiting `/jobs` is still gated exactly like any other user, so there is no back door into the hub — only into operations. Both behaviours are tested.

## Independent review remediation

Two findings, both first-run defects that the fictional preview would have hidden:

1. **The freshly computed CV outcome never reached the interface.** `getView` computed the outcome from the live profile, then returned the _stored_ one from the database row. On a first visit no row exists, so the user would have seen no explanation of what happened to their CV at all — the entire point of the outcome copy. It now returns the computed value, and a test asserts a stale stored outcome is not trusted when the CV has since changed.
2. **A user with no CV was offered a route into a dead end.** The CV step always offered "Continue with my CV", which would have recorded the confirm path for someone with nothing to confirm. The CV route now appears only when a CV exists, follows the path the outcome selected rather than assuming `cv`, and a user without one is offered a single working route instead.

Accepted, recorded observations:

- Once a path is stored it does not change if the user later uploads a CV. They have already answered the questions, so re-routing them mid-flow would discard work. Adding a CV afterwards is a profile action.
- The step content in this task is deliberately thin. Task 18 is the gate, the state machine, and the fallbacks; Task 19 builds the real questions. The flow is nonetheless completable end to end, because shipping a gate without a completable flow would brick the product.

## Acceptance mapping

| Roadmap criterion                                                                  | Evidence                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No protected hub surface is reachable before onboarding, and the gate fails closed | The gate lives in `resolveProtectedAccess`, which every protected layout and both route handlers call. Tests cover a missing row, a corrupt row, a forged timestamp, and a throwing read — all redirect. |
| `/admin` stays reachable to an administrator regardless of onboarding state        | `resolveAdminAccess` is untouched by the gate; a test asserts an un-onboarded administrator still reaches `/admin` and is still gated out of the hub.                                                    |
| State is durable and resumable                                                     | State lives in one owner-keyed row; `nextOnboardingStep` returns the earliest gap, tested against a state whose later steps were completed first.                                                        |
| The branch classifier is pure and covers every outcome                             | `classifyCvOutcome` has a test per outcome plus a boundary test, and the repository has a routing test per outcome including a CV that never finished processing.                                        |
| A "no CV yet" user reaches a working path                                          | The aspiration path is offered as the only route when no CV exists, and its steps ask about direction instead of evidence.                                                                               |
| The fictional preview exercises the branches and refuses mutations                 | The preview serves a mid-flow state and refuses both mutations; every outcome's copy is covered by a UI test.                                                                                            |

## Verification evidence

- `pnpm verify` passed on the remediated head: 1,042 workspace tests across 80 files, plus 130 function tests — 1,172 automated tests total.
- `pnpm check:supabase`: 17 migrations, 32 forced-RLS tables.
- `pnpm audit --prod`: no known vulnerabilities. No dependency was added.
- Browser verification in the exact local development bypass: `/onboarding` at 1440 px and true 390 px with no document overflow and no console errors in a fresh tab; the progress list marking the current step; and `/home`, `/jobs`, `/admin`, and `/profile` all still reachable in development mode, confirming the gate does not break the preview.

## Environment limitations

- Docker is unavailable, so pgTAP file `018_onboarding_state.sql` (14 assertions) is statically verified only.
- The gate has never run against a real session, because authentication activation is Task 21. Its behaviour is covered by unit tests against the resolver.

# Task 19 Guided Setup and First-Run Population Review

**Branch:** `codex/task-19-guided-setup`

**Base:** `main` after the Task 18 publication record

**Review status:** independent review complete; the flow now writes a real profile and lands the user on a populated, filtered feed.

## Outcome

Onboarding no longer just records that it happened — it produces the thing that makes the product work.

`packages/domain/src/onboarding-answers.ts` holds the answer schema and two pure builders. Every field is optional, because a user answers across several visits and may abandon between any two of them; the shape has to survive being half-filled, and a corrupt payload becomes "nothing answered yet" rather than locking someone out of their own setup.

`buildSearchProfileFromAnswers` turns answers plus confirmed evidence into the first named search, and **invents nothing**: an unanswered field with no evidence stays empty. It parses its own output against the search schema, so an answer set that could not be saved fails in a test rather than at the user's final step. The aspiration path works from stated skills alone, which is what makes the student case real rather than nominal.

`buildFirstRunFilters` decides what to pre-apply to the feed. **A multi-selection deliberately becomes no filter**: the feed holds one value per facet, and silently picking one of the user's three chosen employment types would apply a preference they never expressed. Multi-selections still shape matching through the search profile. Unknown pay stays included unless the user explicitly excluded it, because filtering it out by default would silently hide most of the UK market.

Migration `202607190008` adds the `answers` column and a **merging** save, so revisiting a step cannot wipe the answers given after it.

On finish, the repository writes the search profile, the digest preference, and the Explore choice, and only then asks the database to complete — so a failure anywhere leaves the user inside onboarding rather than in an unlocked hub with nothing configured. It reads the live profile generation rather than assuming a fresh account, because another tab or a deletion may have advanced it since onboarding began. The action then redirects to `/jobs` with the chosen preferences as URL filters: applied, visible in the address bar, and one click from being lifted.

## The signal guard

Finishing is refused when there is nothing to match on — no stated role, no stated skill, and no confirmed evidence. Completing in that state would unlock a hub showing the empty feed this entire flow exists to prevent. The guard is enforced in the repository _and_ surfaced in the interface, which disables the finish button and says exactly what is missing rather than failing silently at submit.

## Acceptance mapping

| Roadmap criterion                                                  | Evidence                                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Questions pre-filled from confirmed evidence where evidence exists | The view carries both stored answers and confirmable evidence; the profile builder merges stated skills with evidence-derived ones and deduplicates.           |
| A user with no CV completes through aspirations                    | `buildSearchProfileFromAnswers` works from stated skills alone, tested with empty evidence; the CV route is not offered when no CV exists.                     |
| The first feed is non-empty or explains why                        | The signal guard refuses completion with nothing to match on, in both the repository and the interface.                                                        |
| Every applied preference is visible and removable in one click     | Preferences are carried as existing URL-backed filter parameters, so lifting one is the feed's own control rather than a second mechanism.                     |
| Every choice is editable afterwards from `/profile`                | Onboarding writes through the same `save_search_profile`, notification, and Explore RPCs the profile surface already uses, so the profile edits the same rows. |
| No CV text reaches logs, analytics, errors, URLs, or emails        | Answers hold normalised concepts and preferences only; no excerpt or document text enters the answer schema, which is `strict` and rejects unknown fields.     |

## Verification evidence

- `pnpm verify` passed: 1,068 workspace tests across 81 files, plus 130 function tests — 1,198 automated tests total.
- `pnpm check:supabase`: 18 migrations, 32 forced-RLS tables.
- `pnpm audit --prod`: no known vulnerabilities. No dependency was added.
- `git diff --check` clean; Gitleaks found no leaks.
- Browser verification: `/onboarding` at true 390 px with no document overflow and no console errors in a fresh tab.

## Environment limitations

- Docker is unavailable, so pgTAP files `018` (14 assertions) and `019` (7 assertions) are statically verified only.
- The completion path writes through four RPCs in sequence without a surrounding transaction. Each is individually owner-fenced and idempotent in effect, and a failure leaves onboarding incomplete so the user retries — but a single transaction would be stronger, and is worth revisiting when the flow next changes.
- Step _content_ remains deliberately simple. The plumbing, the guards, and the population are the substance of this task; richer question interfaces are a follow-up that changes no contract.

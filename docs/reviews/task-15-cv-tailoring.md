# Task 15 Evidence-Bound CV Tailoring Review

**Branch:** `codex/task-15-cv-tailoring`

**Base:** `main` at `b4f3a12` (Task 14 publication record)

**Review status:** independent review complete; all findings remediated at `HEAD` with a clean re-run of the full gate.

## Outcome

An approved user selects a job, reviews their CV paragraph by paragraph, proposes conservative wording changes and omissions, and downloads a tailored DOCX that keeps the original document's layout.

The guarantee lives in a deterministic validator, not in a proposer. `packages/domain/src/tailoring.ts` accepts a replacement paragraph only when it introduces nothing new: every **number** must already appear in the user's own CV (the advert's figures are the employer's, not the candidate's achievements), every **substantive term** must already appear in the CV or the advert, and the replacement may not materially outgrow the paragraph it replaces. A paragraph's own text always counts as supporting evidence, so the rule does not depend on how extraction happened to split the document. Function words and common English verbs — including irregular past tenses no stemmer would relate to their infinitive — pass through a bounded, auditable list; a proper noun, tool, employer, qualification, or outcome must never be added to it. This is why the task ships without a language model: a model would be an optional convenience, and its absence costs nothing.

`packages/profile/src/docx-edit.ts` owns OOXML modification, with exactly two operations — replace a paragraph's text, omit a paragraph — because those are the only edits that leave surrounding structure, numbering, and section breaks untouched. It reuses the hardened archive machinery from Task 10 (now narrowly exported rather than copied), **fails closed** on comments, CDATA, and processing instructions, refuses to rewrite a paragraph containing a text box, and writes a new archive in which every part except `word/document.xml` is byte-identical. A replacement keeps the paragraph's first run formatting and empties the rest, and the UI warns when that will collapse mixed inline formatting.

Migration `202607190005_cv_tailoring.sql` adds force-RLS `career_cv_variants`. A variant stores **operations, not a binary**: there is no second file to secure, expire, or leak, and every download regenerates from the stored original. A check constraint ties `draft` to a non-null expiry and `saved` to a null one; `expire_cv_variants()` joins the existing hourly retention schedule. `career_cv_operations_are_valid` enforces the operation vocabulary at the database boundary. `delete_career_profile_data` erases variants. pgTAP file 016 adds 25 assertions; the static verifier enforces 15 migrations and 31 forced-RLS tables.

`/tailor/[jobId]` shows every paragraph with replace and omit controls, live per-paragraph verdicts in plain language, a deterministic focus assist that says which paragraphs already speak to the advert without proposing any wording, a change summary, and explicit save and download steps. A download route handler streams the regenerated archive.

## Independent review remediation

Three findings were fixed at `HEAD`:

1. **The download route was not behind the access gate (important).** A route handler does not run the `(protected)` layout, so `/tailor/[jobId]/download` relied on RLS alone. RLS would still have refused another owner's variant, but this route must not be the one place that depends on it. It now applies `requireProtectedAccess()` explicitly, skipped only in the exact local development bypass, with tests covering the gate, the bypass, and the refusal path.
2. **The XML parser was shipping to the browser (efficiency).** The tailoring UI imported `buildTailoringReview` from the `@jobwarden/profile` barrel, which pulled `saxes` into a 39 KB client chunk for a validator that has no dependencies at all. The pure validator moved to `@jobwarden/domain` (already client-safe); `docx-edit.ts` and the archive machinery stay server-only in `@jobwarden/profile`. A rebuild confirms no `SaxesParser` or `unpdf` reference remains in any client chunk.
3. **A paragraph identical to its original could be rejected (correctness, caught by its own test).** Support was derived from the extracted CV text alone, so a paragraph whose wording the extraction had split differently could fail validation against itself. The paragraph's own text is now always supporting evidence.

Two test defects were also corrected: the DOCX escaping test passed XML text where an archive was expected, and the notifications-style settings helper swallowed a deliberate null.

Accepted, recorded observations:

- **The evidence check is enforced in the server action, not in the database.** `save_cv_variant` validates the operation _shape_; it has no access to the CV text and cannot validate _support_. A user calling the RPC directly with their own token could store an unsupported operation for their own CV. That is out of scope by design: JobWarden's job is not to police a user's own document — they can edit it in Word — but to never _generate_ unsupported content. Every path the product offers runs the check.
- The full extracted CV text is sent to the client so per-keystroke validation needs no round trip. It is the user's own CV in the user's own session, the page is dynamic and uncacheable, and no CV text reaches logs, analytics, errors, URLs, or email.
- `getWorkspace` re-downloads and re-parses the source document on every page load. Bounded by the 5 MB file gate and acceptable at private-beta scale.

## Acceptance mapping

| Roadmap criterion                                                           | Evidence                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The user must supply a DOCX for layout-preserving output                    | `save_cv_variant` requires a `docx`, `is_current`, `ready` document owned by the caller (verifier fragment); the UI renders a distinct explanation for the PDF-only and no-CV cases.                          |
| All proposed changes trace to existing CV evidence and the selected job     | The validator's three rules, with tests covering invented tools, employers, qualifications, figures, and advert-sourced figures; the server action re-runs the check over the workspace it loads itself.      |
| Changed wording and omissions are shown before save/download                | The change summary lists every operation with an accepted or blocked dot and a plain-language reason; saving is disabled while anything is blocked or nothing has changed.                                    |
| Deterministic OOXML code owns editing and rejects unsafe content            | `docx-edit.ts` performs all modification with no model involved; it reuses the Task 10 archive gates (executable parts, unsafe names, size limits) and fails closed on comments, CDATA, and text-box nesting. |
| Unsaved variants expire after 24 hours; saved variants stay user-controlled | The status/expiry check constraint, the 24-hour expiry on save, the hourly `expire_cv_variants` schedule, and explicit keep and delete controls — all asserted by verifier fragments and pgTAP.               |
| Model or quota failure cannot corrupt the original                          | The original is never written. `writeTailoredDocx` reads source bytes and returns a new archive; a test asserts the source array is byte-identical afterwards, and every download regenerates from it.        |

## Verification evidence

- `pnpm verify` passed on the remediated head: 913 workspace tests across 73 files, plus 27 ingest-jobs, 26 extract-career-profile, and 77 send-digests function tests — 1,043 automated tests total. The profile package contributes 152 and the domain package 263.
- `pnpm check:supabase`: 15 migrations, 31 forced-RLS tables.
- `pnpm audit --prod`: no known vulnerabilities. No new third-party dependency was added; `fflate` was already present for archive reading.
- `git diff --check` clean; Gitleaks over the staged range found no leaks.
- Browser verification in the exact local development bypass: `/tailor/[jobId]` at 1440 px and true 390 px with no document overflow and no console errors in a fresh tab; the fictional draft loading with its change summary; the download route returning a real ZIP archive with `attachment` disposition and `no-store`; and 400 and 404 for a malformed and an unknown variant id.

## Environment limitations

- Docker is unavailable, so `supabase db reset` and pgTAP file `016_cv_tailoring.sql` (25 assertions) are statically verified only.
- Real CV upload remains closed exactly as Task 10 left it, so the whole surface is exercised against a fictional DOCX generated in code. No document, real or realistic, is committed.
- The generated archive has been verified to round-trip through JobWarden's own reader. It has **not** been opened in Microsoft Word, which remains a pre-live check.

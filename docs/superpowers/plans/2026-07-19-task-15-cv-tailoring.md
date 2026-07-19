# Task 15 — Evidence-bound CV tailoring

**Branch:** `codex/task-15-cv-tailoring`
**Baseline:** `b4f3a12` (local `main` after the Task 14 publication record)
**Sources of truth:** [roadmap Task 15](../../product/roadmap.md#task-15--evidence-bound-cv-tailoring), [personalised search design](../specs/2026-07-18-personalised-job-search-design.md#tailoring), [free-tier services](../../architecture/free-tier-services.md)

Lenses in play: Supabase (one new force-RLS table plus expiry), touches user data (CV-derived content, owner-only, GDPR erasure), adds infra cost (none — generation is deterministic and local), is user-facing (a new review surface with loading/empty/error states).

## Outcome

An approved user selects a job, reviews their CV paragraph by paragraph, proposes conservative wording changes and omissions, and downloads a tailored DOCX that preserves the original document's layout. Every proposed change is checked against the original CV and the selected advert before it can be accepted, so the product cannot emit a claim the user's own CV does not already support.

## The central rule

A replacement paragraph is accepted only when it introduces nothing new:

- **every number** in the replacement must already appear in the original CV — a figure absent from the CV is a fabricated outcome, and the advert's own numbers are the employer's, not the candidate's;
- **every substantive word** must already appear in the original CV or the selected advert — this is what mechanically prevents invented employers, dates, titles, tools, and qualifications; and
- the replacement may not materially outgrow the original paragraph.

This is deterministic and fully testable. It is also why this task ships without a language model: the guarantee lives in the validator, not in the proposer, so a model is an optional convenience rather than a prerequisite. The user proposes wording, the validator refuses anything unsupported, and a deterministic assist highlights which paragraphs already overlap the advert and which are candidates for omission.

## Deliberate decisions

1. **The original is never mutated.** Every download reads the stored original and writes a *new* archive. No failure of any kind — validation, generation, quota, or model — can corrupt it, which is the acceptance criterion satisfied by construction rather than by care.
2. **Variants store operations, not binaries.** A saved variant is a small list of paragraph operations, regenerated on demand. There is no second binary to secure, expire, or leak, and "unsaved variants expire after 24 hours" becomes ordinary row expiry.
3. **Two operations only: replace paragraph text, omit paragraph.** These are exactly the two things the acceptance criterion asks to be shown ("changed wording and omissions"), and both preserve surrounding structure. Reordering is deliberately excluded — it breaks numbering and section breaks for no proportionate gain.
4. **Editing is string surgery over element boundaries, not a SAX rebuild.** Rebuilding OOXML from parse events loses fidelity in more ways than it protects against. Instead the editor scans well-defined `<w:p>` and `<w:t>` spans and **fails closed** on any document containing comments, CDATA, or processing instructions, which are the only constructs that could make those boundaries ambiguous.
5. **No language model in this slice.** Recorded as a deferred extension point; Task 10's application-wide AI ledger and zero-default allowance already exist to host it.

## Package — `packages/profile/src/`

`docx-edit.ts` (built on the existing hardened archive machinery in `docx.ts`, which gains narrow internal exports rather than a second copy):

- `readDocxParagraphs(bytes)` → `{ index, text, uniformFormatting }[]`, rejecting the ambiguous constructs above.
- `writeTailoredDocx(bytes, operations)` → a new archive: every part byte-identical except `word/document.xml`, re-zipped with the already-installed `fflate`.
- A replacement writes the new text into the paragraph's first run and empties the rest, so the paragraph keeps that run's formatting. A paragraph whose runs carry *different* formatting reports `uniformFormatting: false` and the UI warns that mixed inline formatting will collapse.

`tailoring.ts` (pure):

- `validateTailoredParagraph({ original, replacement, cvText, jobText })` → accepted, or rejected with specific reasons (`introduced_number`, `unsupported_term`, `excessive_expansion`, `empty_replacement`).
- `buildTailoringReview({ paragraphs, operations, cvText, jobText })` → per-operation verdicts, warnings, and a change summary for the confirmation step.
- `suggestTailoringFocus({ paragraphs, jobText, confirmedEvidence })` → deterministic highlight of paragraphs that already overlap the advert, and omission candidates that overlap neither the advert nor confirmed evidence. It proposes no wording.

## Data model — `supabase/migrations/202607190005_cv_tailoring.sql`

`career_cv_variants`, force-RLS, owner-select only: owner, source `cv_document_id`, `job_id`, name, `status` (`draft` | `saved`), `operations` jsonb (bounded), `expires_at`, timestamps. Unique per owner, document, and job for drafts.

Owner-fenced security-definer RPCs behind the generation mutex: `save_cv_variant` (validates the operation array shape and the source document's ownership and currency), `promote_cv_variant` (draft → saved, clearing expiry), `delete_cv_variant`. `expire_cv_variants()` joins the existing hourly retention schedule and deletes drafts past `expires_at`. `delete_career_profile_data` erases variants.

`supabase/tests/016_cv_tailoring.sql` covers the RLS boundary, operation validation, expiry, and erasure; Docker remains unavailable so it stays statically verified.

## Web

`apps/web/src/lib/tailoring/` follows the established repository split. `/jobs/[jobId]` gains a "Tailor my CV" entry; `/tailor/[jobId]` lists the CV's paragraphs with per-paragraph replace/omit controls, live validation verdicts, the highlight assist, a change summary, and explicit save and download steps. Without a current DOCX the page explains that a DOCX source is required for layout-preserving output — the PDF-only case the design already anticipates.

Download runs through a route handler that reads the original, applies saved operations, and streams the archive with `content-disposition: attachment`.

## Verification

The full release gate, plus `pnpm check:supabase` at 15 migrations and 31 forced-RLS tables, and browser verification of `/tailor/[jobId]` at 1440 px and true 390 px.

## Rollback

Additive. The feature is unreachable without a current DOCX, which the Task 10 upload gate still keeps closed; reverting drops one table and one scheduled job.

# Task 10 current state

**Updated:** 2026-07-18

**Repository:** `/Users/jabed/Desktop/Jabed's Trash/Dev/JobWarden`

**Branch:** `codex/task-10-career-profile`

**Base:** Task 9 merge commit `44a3580`

**Implementation head:** `b0d4da3`

**Pull request:** #11 (open; not merged)

This is the durable recovery note for Task 10 until publication. The canonical status remains in [Project Status](../project-status.md). Task 10 stays `active`: the independently approved remediation slices, release record, and local release gate are complete, but final whole-branch review, PR merge, local `main` update, and merge-commit verification are still required.

## Completed and independently approved remediation

- `d1ee375` fences the extraction runtime with service-only claims, renewable one-minute leases, unguessable token-fenced completion, stale-run recovery, a registered-size/SHA-256 binding, a streamed request cap, and one overall lifecycle deadline. Its durable application-wide UTC-date AI ledger has no user/profile foreign key; the private owner allowance defaults to zero and is constrained to `0..25`.
- `b4dd62a` hardens DOCX/PDF extraction with central/local ZIP validation, overlap and actual-output bounds, namespace-aware document/body and visibility parsing, incremental visible PDF text, geometry/rendering checks, immediate cancellation, and loading-task/document cleanup within the deadline.
- `b0d4da3` closes owner-authority and concurrency gaps. Profile/search saves, confirmed-evidence pruning, evidence decisions, extraction completion, upload intent/Storage registration, CV cleanup, and full deletion share a durable owner generation mutex. Search arrays are unique and confirmed-evidence-only; stale evidence is pruned. Full deletion inventories nested and uploaded-but-unregistered Storage objects before structured deletion. Two-session pgTAP fixtures cover concurrent first-search saves and search-save/evidence-delete ordering. Stable selected-search refresh and controlled-state clearing are regression-covered.

Task 3's final independent specification and quality re-review at `b0d4da3` passed with no findings. This approval is slice-scoped and is not the final whole-branch review.

## Current release-gate state

The Task 4 operational record and documentation commit are complete. The pre-commit gate passed frozen install; formatting, lint, all typechecks and Deno graphs; 535 workspace, 27 ingestion, and 25 extraction tests; guardrails; the production build; the 10-migration/20-forced-RLS static Supabase verifier; a clean production audit; branch/working-tree diff checks; and a 14-commit Gitleaks scan. The production bypass probe failed closed with the expected forbidden-bypass error. Exact amended-head verification is kept in the ignored SDD final-head evidence handoff.

Required remaining steps are:

1. obtain a clean independent whole-branch review of `44a3580..HEAD` and address every Critical or Important finding;
2. update and merge PR #11, update local `main`, rerun the merge-commit gate, and only then mark Task 10 `reviewed`.

Task 11 has not started.

## Permanent safety boundary

Real CV upload remains disabled in both the web capability and database settings. The future path also requires a generation-bound 15-minute upload intent before Storage insert/registration; Task 10 enables none of it for real use.

Real upload must stay disabled until approved live authentication, private Storage/RLS isolation, fictional replacement/deletion/retention and complete erasure exercises, and Docker-backed database reset/pgTAP verification have all passed. No real CV or personal-data fixture may be added to the repository.

The PDF lexical preflight deliberately rejects streams whose `/Length` is an indirect reference, so linearized or streaming-produced CV PDFs fail closed as `invalid_file`. This compatibility ceiling must be reassessed with fictional fixtures before real uploads are enabled.

Docker, the Supabase CLI, `psql`, and `pg_prove` are unavailable in the current environment. The static verifier and SQL fixtures are locally exercised, but migrations 004–007 and pgTAP 007–011—including the 13-assertion two-session concurrency fixture—are not claimed as runtime-green.

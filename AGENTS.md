# JobWarden Agent Instructions

Read `docs/project-status.md`, `docs/standards/shipping-standards.md`, and the active specification or plan before changing code.

JobWarden is UK-only. Publish a job only with explicit UK eligibility evidence, including explicit UK permission for remote work. Do not infer IR35 status from contract status.

JobWarden is a private beta. Product data is available only to administrator-approved users, with RLS as the final boundary. Authentication alone never grants access. Administrator status is server-controlled.

Owner decision, 2026-07-17: connecting and operating authentication is deferred while the remaining product is built. Retain the reviewed auth and RLS implementation. Local product work may use only the documented `JOBWARDEN_DEV_ACCESS_BYPASS=true` mode, which must fail closed outside `NODE_ENV=development`, must stay server-only, and must never grant administrator access. Do not make authentication setup a prerequisite for the next product task unless the owner explicitly reactivates it.

JobWarden has no pricing model. Never add payments, subscriptions, plans, trials, premium or upgrade UI, billing settings, or plan-based quotas.

Applications use manual application links only. Never submit applications or bypass source access controls.

Use public documented endpoints from explicitly allowlisted sources. Keep source compliance metadata, bounded retries, sanitised errors, append-only audit records, and user-visible degraded states.

After each implementation task passes its independent review and full verification, publish it through a GitHub pull request, merge it into `main`, and update local `main` before starting the next task. Do not leave completed task work only on a local feature branch.

Before UI work, read `docs/design/ui-direction.md`. When available, load `anthropic-skills:web-artifacts-builder` for its anti-slop design guidance, `vercel:shadcn` for component composition, and `vercel:react-best-practices` for the final TSX review. The approved product specification and JobWarden UI direction override generic skill defaults.

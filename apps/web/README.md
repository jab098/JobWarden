# JobWarden web app

This directory contains the Next.js web application for JobWarden. Use the [root README](../../README.md) for repository setup, environment guidance, and full verification.

Run web-app commands from the repository root:

```sh
pnpm --filter @jobwarden/web dev
pnpm --filter @jobwarden/web lint
pnpm --filter @jobwarden/web typecheck
pnpm --filter @jobwarden/web build
```

Cloudflare Workers through OpenNext is the planned hosting target. Task 1 only scaffolds the web application; deployment and OpenNext configuration are added in later tasks.

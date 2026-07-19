import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const guardrailScript = resolve("scripts/check-project-guardrails.mjs");

it("passes a clean workspace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    const result = await execFileAsync(process.execPath, [guardrailScript], {
      cwd: workspace,
    });

    expect(result.stdout.trim()).toBe("Project guardrails passed");
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it("rejects a forbidden dependency", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    const app = join(workspace, "apps/web");
    await mkdir(app, { recursive: true });
    await writeFile(
      join(app, "package.json"),
      '{"dependencies":{"stripe":"latest"}}',
    );

    await expect(
      execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "apps/web/package.json: forbidden dependency stripe",
      ),
    });
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it("rejects a forbidden dependency in the root manifest", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    await writeFile(
      join(workspace, "package.json"),
      '{"dependencies":{"stripe":"latest"}}',
    );

    await expect(
      execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "package.json: forbidden dependency stripe",
      ),
    });
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it("rejects forbidden pricing copy outside tests", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    const app = join(workspace, "apps/web");
    await mkdir(app, { recursive: true });
    await writeFile(
      join(app, "page.tsx"),
      'export const label = "Upgrade plan";',
    );

    await expect(
      execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "apps/web/page.tsx: forbidden pricing copy",
      ),
    });
  } finally {
    await rm(workspace, { recursive: true });
  }
});

const notificationAdapter = "supabase/functions/send-digests/resend.ts";
const notificationAdapterTest =
  "supabase/functions/send-digests/resend.test.ts";

it.each([
  [
    "apps/web/src/components/digest-banner.tsx",
    'import { Resend } from "resend";',
  ],
  ["apps/web/src/lib/notifications/send.ts", 'const client = "resend";'],
  [
    "packages/domain/src/notifications.ts",
    "const key = process.env.RESEND_API_KEY;",
  ],
  [
    "supabase/functions/send-digests/handler.ts",
    'await fetch("https://api.resend.com/emails");',
  ],
  [
    "supabase/functions/ingest-jobs/repository.ts",
    'const provider = "resend";',
  ],
])("rejects a Resend reference in %s", async (path, source) => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    await mkdir(join(workspace, dirname(path)), { recursive: true });
    await writeFile(join(workspace, path), source);

    await expect(
      execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `${path}: Resend is permitted only in the server-only notification adapter`,
      ),
    });
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it.each([
  notificationAdapter,
  notificationAdapterTest,
  "supabase/functions/send-digests/index.ts",
])("permits Resend inside %s", async (path) => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    await mkdir(join(workspace, dirname(path)), { recursive: true });
    await writeFile(
      join(workspace, path),
      'export const endpoint = "https://api.resend.com/emails";',
    );

    const result = await execFileAsync(process.execPath, [guardrailScript], {
      cwd: workspace,
    });

    expect(result.stdout.trim()).toBe("Project guardrails passed");
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it("still rejects the permanently forbidden dependencies inside the notification adapter", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    await mkdir(join(workspace, dirname(notificationAdapter)), {
      recursive: true,
    });
    await writeFile(
      join(workspace, notificationAdapter),
      'import Stripe from "stripe";',
    );

    await expect(
      execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `${notificationAdapter}: forbidden dependency stripe`,
      ),
    });
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it.each([
  "Pricing",
  "Payment",
  "Subscribe",
  "Subscription",
  "Premium",
  "Billing",
  "Checkout",
  "Trial",
  "Upgrade",
])("rejects plain %s product copy outside tests", async (forbiddenCopy) => {
  const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

  try {
    const app = join(workspace, "apps/web");
    await mkdir(app, { recursive: true });
    await writeFile(
      join(app, "page.tsx"),
      `export const label = ${JSON.stringify(forbiddenCopy)};`,
    );

    await expect(
      execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "apps/web/page.tsx: forbidden pricing copy",
      ),
    });
  } finally {
    await rm(workspace, { recursive: true });
  }
});

it.each(["posthog-js", "@vercel/analytics", "mixpanel-browser"])(
  "rejects the browser analytics SDK %s",
  async (analytics) => {
    const workspace = await mkdtemp(join(tmpdir(), "jobwarden-guardrails-"));

    try {
      const app = join(workspace, "apps/web");
      await mkdir(app, { recursive: true });
      await writeFile(
        join(app, "page.tsx"),
        `import x from "${analytics}"; export default x;`,
      );

      await expect(
        execFileAsync(process.execPath, [guardrailScript], { cwd: workspace }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          `apps/web/page.tsx: forbidden browser analytics ${analytics}`,
        ),
      });
    } finally {
      await rm(workspace, { recursive: true });
    }
  },
);

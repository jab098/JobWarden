import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/standards/shipping-standards.md",
  "docs/superpowers/specs/2026-07-17-jobwarden-foundation-design.md",
];

describe("project guardrails", () => {
  it.each(requiredFiles)("keeps %s in the repository", async (path) => {
    await expect(readFile(path, "utf8")).resolves.toBeTruthy();
  });

  it("records the permanent product invariants", async () => {
    const agents = await readFile("AGENTS.md", "utf8");
    expect(agents).toContain("UK-only");
    expect(agents).toContain("administrator-approved");
    expect(agents).toContain("no pricing model");
    expect(agents).toContain("manual application links");
  });
});

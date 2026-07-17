import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/standards/shipping-standards.md",
  "docs/superpowers/specs/2026-07-17-jobwarden-foundation-design.md",
  "docs/superpowers/specs/2026-07-18-personalised-job-search-design.md",
  "docs/product/roadmap.md",
  "docs/architecture/free-tier-services.md",
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
    expect(agents).toContain("hard free-tier ceiling");
    expect(agents).toContain("Never commit a real CV");
    expect(agents).toContain("evidence-bound");
    expect(agents).toContain("advertised, estimated, and unknown");
  });
});

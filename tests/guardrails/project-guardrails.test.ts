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

  it("confines Resend to the server-only Task 14 notification adapter", async () => {
    const guardrail = await readFile(
      "scripts/check-project-guardrails.mjs",
      "utf8",
    );
    expect(guardrail).toContain('"supabase/functions/send-digests/resend.ts"');
    expect(guardrail).toContain("const resendReference = /resend/i");
    expect(guardrail).toContain("Task 14");
    expect(guardrail).not.toContain("deferredDependencies");
    // The adapter is only genuinely server-only if the guard actually reads
    // the function tree it lives in.
    expect(guardrail).toContain('"supabase/functions"');
  });

  it("pins the approved matching, scheduling, cost, and preview boundaries", async () => {
    const [design, roadmap, agents] = await Promise.all([
      readFile(
        "docs/superpowers/specs/2026-07-18-personalised-job-search-design.md",
        "utf8",
      ),
      readFile("docs/product/roadmap.md", "utf8"),
      readFile("AGENTS.md", "utf8"),
    ]);

    expect(design).toContain("| Demonstrated skills and tools | 45");
    expect(design).toContain("| Responsibilities and work patterns | 20");
    expect(design).toContain("| Seniority and experience | 15");
    expect(design).toContain("| Industry and domain | 10");
    expect(design).toContain(
      "| Location, employment, workplace, and IR35 preference fit | 10",
    );
    expect(design).toContain("at least 70% weighted overlap");
    expect(design).toContain("no more than two significant trainable gaps");
    expect(design).toContain("09:00, 12:00, 15:00, and 18:00 Europe/London");
    expect(design).toContain("no automatic paid fallback");
    expect(roadmap).toContain("globally coalesced");
    expect(agents).toContain("development administrator preview is read-only");
    expect(agents).toContain("never grants administrator access");
  });
});

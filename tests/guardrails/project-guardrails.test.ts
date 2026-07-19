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
    expect(guardrail).toContain("const resendReference =");
    // Naming the provider as a subprocessor is disclosure, not use.
    expect(guardrail).toContain("[Rr]esend");
    expect(guardrail).toContain("Task 14");
    expect(guardrail).not.toContain("deferredDependencies");
    // The adapter is only genuinely server-only if the guard actually reads
    // the function tree it lives in.
    expect(guardrail).toContain('"supabase/functions"');
  });

  it("discloses every subprocessor the application names", async () => {
    const [policy, page] = await Promise.all([
      readFile("docs/privacy/privacy-policy.md", "utf8"),
      readFile("apps/web/src/components/legal/legal-page.tsx", "utf8"),
    ]);

    // A provider that processes personal data must appear in both the policy
    // document and the page users actually read, so a service cannot be added
    // without being disclosed.
    for (const provider of ["Supabase", "Cloudflare", "Resend", "Sentry"]) {
      expect(policy).toContain(provider);
      expect(page).toContain(provider);
    }
    expect(policy).toContain("UK International Data Transfer Addendum");
    expect(policy).toContain("no non-essential cookies");
  });

  it("keeps the export and deletion rights both real", async () => {
    const migrations = await readFile(
      "supabase/migrations/202607190006_data_export.sql",
      "utf8",
    );

    expect(migrations).toContain(
      "create or replace function public.export_career_profile_data()",
    );
    // The export must not become a way to pull CV bytes through the Data API.
    expect(migrations).not.toContain("storage_path");
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

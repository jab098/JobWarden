import { describe, expect, it } from "vitest";

import { CvFileValidationError, cvFileLimits } from "./file-gate.ts";
import { createDeterministicProfileProposal } from "./proposal.ts";

const fictionalText = [
  "Fictional candidate profile",
  "Delivered analytics implementation and SQL reporting for governed services.",
  "Led stakeholder management, requirements gathering, and project delivery.",
  "Used Power BI and Tealium for tag management in marketing technology teams.",
].join("\n");

describe("deterministic profile proposal", () => {
  it("proposes only explicit bounded evidence with character provenance", () => {
    const proposal = createDeterministicProfileProposal(fictionalText);

    expect(proposal.version).toBe("deterministic-v1");
    expect(proposal.inputCharacterCount).toBe(fictionalText.length);
    expect(
      proposal.evidence.map(({ normalizedConcept }) => normalizedConcept),
    ).toEqual(
      expect.arrayContaining([
        "analytics implementation",
        "sql",
        "stakeholder management",
        "requirements gathering",
        "project delivery",
        "power bi",
        "tealium",
        "tag management",
        "martech",
      ]),
    );

    for (const evidence of proposal.evidence) {
      const match = /^character:(\d+)-(\d+)$/.exec(evidence.evidenceReference);
      expect(match).not.toBeNull();
      const start = Number(match?.[1]);
      const end = Number(match?.[2]);
      expect(fictionalText.slice(start, end).toLowerCase()).toContain(
        evidence.matchedText.toLowerCase(),
      );
      expect(evidence.evidenceExcerpt.length).toBeLessThanOrEqual(280);
      expect(evidence.confirmationState).toBe("proposed");
    }
  });

  it("keeps role-family suggestions inactive and tied to evidence references", () => {
    const proposal = createDeterministicProfileProposal(fictionalText);

    expect(proposal.suggestions).toContainEqual(
      expect.objectContaining({
        kind: "role_family",
        normalizedConcept: "analytics implementation consulting",
        state: "proposed",
      }),
    );
    expect(
      proposal.suggestions.every(
        ({ evidenceReferences }) => evidenceReferences.length > 0,
      ),
    ).toBe(true);
  });

  it("does not infer SQL from NoSQL or invent concepts absent from text", () => {
    const proposal = createDeterministicProfileProposal(
      "Fictional engineer maintained a NoSQL datastore.",
    );

    expect(proposal.evidence).toEqual([]);
    expect(proposal.suggestions).toEqual([]);
  });

  it("deduplicates repeated explicit concepts deterministically", () => {
    const first = createDeterministicProfileProposal(
      "SQL reporting. Later SQL reporting and more SQL.",
    );
    const second = createDeterministicProfileProposal(
      "SQL reporting. Later SQL reporting and more SQL.",
    );

    expect(first).toEqual(second);
    expect(
      first.evidence.filter(
        ({ normalizedConcept }) => normalizedConcept === "sql",
      ),
    ).toHaveLength(1);
  });

  it("rejects empty or over-limit text with a sanitised error", () => {
    for (const text of [
      "   ",
      "x".repeat(cvFileLimits.extractedCharacters + 1),
    ]) {
      expect(() => createDeterministicProfileProposal(text)).toThrowError(
        expect.objectContaining({ code: "invalid_file" }),
      );
    }

    try {
      createDeterministicProfileProposal("   ");
      expect.unreachable("empty extracted text should be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CvFileValidationError);
      expect((error as Error).message).not.toContain(fictionalText);
    }
  });

  it("returns no raw CV field or contact-data projection", () => {
    const proposal = createDeterministicProfileProposal(
      `${fictionalText}\nfictional.person@example.test\n07123 000 000`,
    );

    expect(proposal).not.toHaveProperty("text");
    expect(proposal).not.toHaveProperty("rawText");
    expect(JSON.stringify(proposal)).not.toContain(
      "fictional.person@example.test",
    );
    expect(JSON.stringify(proposal)).not.toContain("07123 000 000");
  });
});

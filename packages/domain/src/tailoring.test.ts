import { describe, expect, it } from "vitest";

import {
  buildTailoringReview,
  suggestTailoringFocus,
  validateTailoredParagraph,
  type DocxParagraph,
} from "./tailoring.ts";

// Fictional CV text. Never use a real CV, contact detail, or realistic
// personal-data fixture.
const cvText = [
  "Fictionex Ltd — Senior Analytics Engineer, 2021 to 2026.",
  "Built event instrumentation and analytics implementation for 12 product teams.",
  "Owned data quality governance and reduced reporting defects by 30 percent.",
  "Tools: SQL, Python, dbt, Snowplow.",
  "Northgate Fiction Ltd — Analyst, 2018 to 2021. Ran experimentation programmes.",
].join("\n");

const jobText = [
  "We are hiring a Measurement Lead to own attribution and experimentation.",
  "You will drive analytics implementation across squads and improve data quality.",
  "Experience with SQL and dbt is essential. Kubernetes exposure is a bonus.",
].join("\n");

function check(original: string, replacement: string) {
  return validateTailoredParagraph({
    original,
    replacement,
    cvText,
    jobText,
  });
}

describe("validateTailoredParagraph", () => {
  it("accepts a rewording drawn from the CV and the advert", () => {
    const result = check(
      "Built event instrumentation and analytics implementation for 12 product teams.",
      "Drove analytics implementation and event instrumentation across 12 squads.",
    );

    expect(result.accepted).toBe(true);
  });

  it("accepts an unchanged paragraph", () => {
    const original = "Tools: SQL, Python, dbt, Snowplow.";
    expect(check(original, original).accepted).toBe(true);
  });

  it("rejects a number that appears in neither the CV nor a smaller claim", () => {
    const result = check(
      "Owned data quality governance and reduced reporting defects by 30 percent.",
      "Owned data quality governance and reduced reporting defects by 60 percent.",
    );

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons).toContainEqual({
        code: "introduced_number",
        detail: "60",
      });
    }
  });

  it("rejects a number taken from the advert rather than the CV", () => {
    // The advert's figures belong to the employer, not to the candidate.
    const result = validateTailoredParagraph({
      original: "Ran experimentation programmes.",
      replacement: "Ran experimentation programmes for 500 clients.",
      cvText,
      jobText: "We serve 500 clients across the UK.",
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons.map((reason) => reason.code)).toContain(
        "introduced_number",
      );
    }
  });

  it("rejects an invented tool", () => {
    const result = check(
      "Tools: SQL, Python, dbt, Snowplow.",
      "Tools: SQL, Python, dbt, Snowplow, Terraform.",
    );

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons).toContainEqual({
        code: "unsupported_term",
        detail: "terraform",
      });
    }
  });

  it("rejects an invented employer", () => {
    const result = check(
      "Northgate Fiction Ltd — Analyst, 2018 to 2021. Ran experimentation programmes.",
      "Brightmoor Consulting — Analyst, 2018 to 2021. Ran experimentation programmes.",
    );

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons.map((reason) => reason.detail)).toContain(
        "brightmoor",
      );
    }
  });

  it("rejects an invented qualification", () => {
    const result = check(
      "Tools: SQL, Python, dbt, Snowplow.",
      "Tools: SQL, Python, dbt, Snowplow. Certified Kubernetes Administrator.",
    );

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      // "kubernetes" is in the advert, but "certified" and "administrator"
      // are in neither document, so the claim cannot be assembled.
      expect(result.reasons.map((reason) => reason.detail)).toContain(
        "certified",
      );
    }
  });

  it("allows a term the advert supplies even when the CV does not", () => {
    const result = check(
      "Ran experimentation programmes.",
      "Ran experimentation and attribution programmes.",
    );

    expect(result.accepted).toBe(true);
  });

  it("rejects a materially longer paragraph", () => {
    const original = "Tools: SQL, Python, dbt, Snowplow.";
    const result = check(
      original,
      `${original} ${"Owned data quality governance and analytics implementation. ".repeat(4)}`,
    );

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons.map((reason) => reason.code)).toContain(
        "excessive_expansion",
      );
    }
  });

  it("rejects an empty replacement", () => {
    const result = check("Tools: SQL, Python, dbt, Snowplow.", "   ");

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reasons.map((reason) => reason.code)).toContain(
        "empty_replacement",
      );
    }
  });

  it("ignores case, punctuation, and common words", () => {
    const result = check(
      "Built event instrumentation and analytics implementation for 12 product teams.",
      "BUILT — event instrumentation; with analytics implementation, for the 12 product teams!",
    );

    expect(result.accepted).toBe(true);
  });

  it("treats a number reused from the same CV paragraph as supported", () => {
    const result = check(
      "Fictionex Ltd — Senior Analytics Engineer, 2021 to 2026.",
      "Senior Analytics Engineer at Fictionex Ltd, 2021 to 2026.",
    );

    expect(result.accepted).toBe(true);
  });

  it("reports every reason rather than stopping at the first", () => {
    const result = check(
      "Tools: SQL, Python, dbt, Snowplow.",
      "Tools: SQL, Terraform, Ansible. Delivered 99 percent uptime.",
    );

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      const codes = result.reasons.map((reason) => reason.code);
      expect(codes).toContain("unsupported_term");
      expect(codes).toContain("introduced_number");
    }
  });
});

const paragraphs: DocxParagraph[] = [
  {
    index: 0,
    text: "Fictionex Ltd — Senior Analytics Engineer, 2021 to 2026.",
    uniformFormatting: true,
  },
  {
    index: 1,
    text: "Built event instrumentation and analytics implementation for 12 product teams.",
    uniformFormatting: false,
  },
  {
    index: 2,
    text: "Hobbies: long-distance cycling and amateur radio.",
    uniformFormatting: true,
  },
];

describe("buildTailoringReview", () => {
  it("summarises accepted changes and omissions", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [
        {
          paragraphIndex: 1,
          kind: "replace",
          text: "Drove analytics implementation across 12 squads.",
        },
        { paragraphIndex: 2, kind: "omit" },
      ],
      cvText,
      jobText,
    });

    expect(review.acceptedCount).toBe(2);
    expect(review.rejectedCount).toBe(0);
    expect(review.changes).toHaveLength(2);
    expect(review.changes[0]).toMatchObject({
      paragraphIndex: 1,
      kind: "replace",
      accepted: true,
    });
    expect(review.changes[1]).toMatchObject({ kind: "omit", accepted: true });
  });

  it("warns when a rewritten paragraph has mixed inline formatting", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [
        {
          paragraphIndex: 1,
          kind: "replace",
          text: "Drove analytics implementation across 12 squads.",
        },
      ],
      cvText,
      jobText,
    });

    expect(review.changes[0]?.warnings).toContain("mixed_formatting");
  });

  it("does not warn about formatting when a paragraph is omitted", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [{ paragraphIndex: 1, kind: "omit" }],
      cvText,
      jobText,
    });

    expect(review.changes[0]?.warnings).toEqual([]);
  });

  it("marks an unsupported change as rejected and keeps its reasons", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [
        {
          paragraphIndex: 0,
          kind: "replace",
          text: "Principal Engineer at Brightmoor Consulting, 2021 to 2026.",
        },
      ],
      cvText,
      jobText,
    });

    expect(review.acceptedCount).toBe(0);
    expect(review.rejectedCount).toBe(1);
    expect(review.changes[0]?.accepted).toBe(false);
    expect(review.changes[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("rejects an operation pointing outside the document", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [{ paragraphIndex: 99, kind: "omit" }],
      cvText,
      jobText,
    });

    expect(review.changes[0]).toMatchObject({
      accepted: false,
      reasons: [{ code: "unknown_paragraph", detail: "99" }],
    });
  });

  it("rejects a duplicate operation on one paragraph", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [
        { paragraphIndex: 1, kind: "omit" },
        {
          paragraphIndex: 1,
          kind: "replace",
          text: "Analytics implementation.",
        },
      ],
      cvText,
      jobText,
    });

    expect(review.changes[1]).toMatchObject({
      accepted: false,
      reasons: [{ code: "duplicate_paragraph", detail: "1" }],
    });
  });

  it("counts a replacement identical to the original as no change", () => {
    const review = buildTailoringReview({
      paragraphs,
      operations: [
        { paragraphIndex: 2, kind: "replace", text: paragraphs[2]!.text },
      ],
      cvText,
      jobText,
    });

    expect(review.changes[0]).toMatchObject({
      accepted: true,
      unchanged: true,
    });
    expect(review.acceptedCount).toBe(0);
  });
});

describe("suggestTailoringFocus", () => {
  it("highlights paragraphs that already overlap the advert", () => {
    const focus = suggestTailoringFocus({
      paragraphs,
      jobText,
      confirmedConcepts: ["sql", "experimentation"],
    });

    expect(focus.relevant).toContain(1);
  });

  it("suggests omitting a paragraph that matches neither advert nor evidence", () => {
    const focus = suggestTailoringFocus({
      paragraphs,
      jobText,
      confirmedConcepts: ["sql", "experimentation"],
    });

    expect(focus.omissionCandidates).toContain(2);
    expect(focus.omissionCandidates).not.toContain(1);
  });

  it("proposes no wording of its own", () => {
    const focus = suggestTailoringFocus({
      paragraphs,
      jobText,
      confirmedConcepts: [],
    });

    expect(Object.keys(focus).toSorted()).toEqual([
      "omissionCandidates",
      "relevant",
    ]);
  });
});

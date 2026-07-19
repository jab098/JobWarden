export interface DocxParagraph {
  index: number;
  text: string;
  /** False when the paragraph's runs carry different inline formatting. */
  uniformFormatting: boolean;
}

export type TailoringOperation =
  | { paragraphIndex: number; kind: "replace"; text: string }
  | { paragraphIndex: number; kind: "omit" };

export type TailoringRejectionCode =
  | "empty_replacement"
  | "excessive_expansion"
  | "introduced_number"
  | "unsupported_term"
  | "unknown_paragraph"
  | "duplicate_paragraph";

export interface TailoringRejection {
  code: TailoringRejectionCode;
  detail: string;
}

export type TailoringVerdict =
  | { accepted: true }
  | { accepted: false; reasons: readonly TailoringRejection[] };

export type TailoringWarning = "mixed_formatting";

export interface TailoringChange {
  paragraphIndex: number;
  kind: TailoringOperation["kind"];
  original: string;
  replacement: string | null;
  accepted: boolean;
  /** True when an accepted replacement is identical to the original. */
  unchanged: boolean;
  reasons: readonly TailoringRejection[];
  warnings: readonly TailoringWarning[];
}

export interface TailoringReview {
  changes: readonly TailoringChange[];
  acceptedCount: number;
  rejectedCount: number;
}

/**
 * A replacement may not materially outgrow the paragraph it replaces. Tailoring
 * is meant to sharpen existing content, not to grow new claims in the gaps.
 */
const EXPANSION_FACTOR = 1.6;
const EXPANSION_SLACK = 40;
const MINIMUM_TERM_LENGTH = 3;

/**
 * Words that cannot by themselves constitute a fabricated credential: function
 * words, and the common English verbs that ordinary rewording needs (including
 * irregular past tenses, which no stemmer would relate to their infinitive).
 * Every other substantive term must already appear in the user's own CV or in
 * the selected advert. Keep this list boring — a proper noun, tool, employer,
 * qualification, or outcome must never be added to it.
 */
const commonTerms = new Set([
  "able",
  "about",
  "above",
  "across",
  "after",
  "again",
  "against",
  "all",
  "almost",
  "along",
  "also",
  "although",
  "always",
  "among",
  "and",
  "another",
  "any",
  "are",
  "around",
  "and/or",
  "back",
  "became",
  "because",
  "become",
  "been",
  "before",
  "began",
  "begin",
  "being",
  "below",
  "besides",
  "best",
  "better",
  "between",
  "both",
  "brought",
  "build",
  "building",
  "built",
  "but",
  "can",
  "carried",
  "carry",
  "came",
  "come",
  "continue",
  "continued",
  "could",
  "created",
  "create",
  "current",
  "currently",
  "day",
  "days",
  "define",
  "defined",
  "deliver",
  "delivered",
  "delivering",
  "delivery",
  "did",
  "does",
  "doing",
  "done",
  "drive",
  "driven",
  "drives",
  "driving",
  "drove",
  "during",
  "each",
  "early",
  "either",
  "enable",
  "enabled",
  "ensure",
  "ensured",
  "every",
  "expand",
  "expanded",
  "first",
  "focus",
  "focused",
  "for",
  "from",
  "further",
  "gave",
  "gained",
  "get",
  "give",
  "given",
  "grew",
  "grow",
  "growing",
  "had",
  "has",
  "have",
  "having",
  "held",
  "help",
  "helped",
  "her",
  "here",
  "high",
  "his",
  "hold",
  "how",
  "however",
  "improve",
  "improved",
  "improving",
  "include",
  "included",
  "including",
  "increase",
  "increased",
  "into",
  "introduce",
  "introduced",
  "its",
  "itself",
  "kept",
  "keep",
  "known",
  "large",
  "largely",
  "last",
  "late",
  "later",
  "lead",
  "leading",
  "led",
  "less",
  "level",
  "like",
  "made",
  "main",
  "maintain",
  "maintained",
  "make",
  "making",
  "manage",
  "managed",
  "managing",
  "many",
  "may",
  "meet",
  "met",
  "month",
  "months",
  "more",
  "most",
  "moved",
  "much",
  "must",
  "near",
  "need",
  "needed",
  "new",
  "next",
  "not",
  "now",
  "off",
  "often",
  "once",
  "one",
  "only",
  "onto",
  "open",
  "other",
  "others",
  "our",
  "out",
  "over",
  "own",
  "owned",
  "owning",
  "part",
  "per",
  "provide",
  "provided",
  "providing",
  "put",
  "ran",
  "ran",
  "reduce",
  "reduced",
  "reducing",
  "ran",
  "run",
  "running",
  "said",
  "same",
  "saw",
  "set",
  "several",
  "shape",
  "shaped",
  "she",
  "should",
  "shown",
  "significant",
  "since",
  "small",
  "some",
  "started",
  "start",
  "still",
  "strong",
  "such",
  "support",
  "supported",
  "supporting",
  "sure",
  "take",
  "taken",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "three",
  "through",
  "time",
  "times",
  "took",
  "toward",
  "towards",
  "two",
  "under",
  "until",
  "upon",
  "use",
  "used",
  "using",
  "very",
  "was",
  "week",
  "weeks",
  "well",
  "went",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whole",
  "whose",
  "why",
  "wide",
  "widely",
  "will",
  "with",
  "within",
  "without",
  "work",
  "worked",
  "working",
  "would",
  "year",
  "years",
  "yet",
  "you",
  "your",
]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
}

function substantiveTerms(value: string): Set<string> {
  return new Set(
    words(value).filter(
      (token) =>
        token.length >= MINIMUM_TERM_LENGTH &&
        !commonTerms.has(token) &&
        !/^\d+$/u.test(token),
    ),
  );
}

function numbers(value: string): Set<string> {
  return new Set(value.match(/\d+(?:\.\d+)?/gu) ?? []);
}

/**
 * The anti-fabrication gate. A replacement is accepted only when it introduces
 * no figure absent from the user's own CV and no substantive term absent from
 * both the CV and the advert. Numbers are held to the CV alone: the advert's
 * figures are the employer's, not the candidate's achievements.
 */
export function validateTailoredParagraph(input: {
  original: string;
  replacement: string;
  cvText: string;
  jobText: string;
}): TailoringVerdict {
  const replacement = input.replacement.trim();
  if (replacement.length === 0) {
    return {
      accepted: false,
      reasons: [{ code: "empty_replacement", detail: "" }],
    };
  }

  const reasons: TailoringRejection[] = [];

  // The paragraph being replaced is itself the user's own writing, so it always
  // counts as supporting evidence. Deriving support from the extracted CV text
  // alone would depend on how that extraction happened to split the document.
  const allowedNumbers = numbers(`${input.cvText}\n${input.original}`);
  for (const value of numbers(replacement)) {
    if (!allowedNumbers.has(value)) {
      reasons.push({ code: "introduced_number", detail: value });
    }
  }

  const supported = substantiveTerms(
    `${input.cvText}\n${input.jobText}\n${input.original}`,
  );
  for (const term of substantiveTerms(replacement)) {
    if (!supported.has(term)) {
      reasons.push({ code: "unsupported_term", detail: term });
    }
  }

  const budget = Math.round(
    input.original.trim().length * EXPANSION_FACTOR + EXPANSION_SLACK,
  );
  if (replacement.length > budget) {
    reasons.push({ code: "excessive_expansion", detail: String(budget) });
  }

  return reasons.length === 0
    ? { accepted: true }
    : { accepted: false, reasons };
}

export function buildTailoringReview(input: {
  paragraphs: readonly DocxParagraph[];
  operations: readonly TailoringOperation[];
  cvText: string;
  jobText: string;
}): TailoringReview {
  const byIndex = new Map(
    input.paragraphs.map((paragraph) => [paragraph.index, paragraph]),
  );
  const seen = new Set<number>();
  const changes: TailoringChange[] = [];

  for (const operation of input.operations) {
    const paragraph = byIndex.get(operation.paragraphIndex);
    const base = {
      paragraphIndex: operation.paragraphIndex,
      kind: operation.kind,
      original: paragraph?.text ?? "",
      replacement: operation.kind === "replace" ? operation.text : null,
      unchanged: false,
      warnings: [] as TailoringWarning[],
    };

    if (paragraph === undefined) {
      changes.push({
        ...base,
        accepted: false,
        reasons: [
          {
            code: "unknown_paragraph",
            detail: String(operation.paragraphIndex),
          },
        ],
      });
      continue;
    }

    if (seen.has(operation.paragraphIndex)) {
      changes.push({
        ...base,
        accepted: false,
        reasons: [
          {
            code: "duplicate_paragraph",
            detail: String(operation.paragraphIndex),
          },
        ],
      });
      continue;
    }
    seen.add(operation.paragraphIndex);

    if (operation.kind === "omit") {
      changes.push({ ...base, accepted: true, reasons: [] });
      continue;
    }

    const verdict = validateTailoredParagraph({
      original: paragraph.text,
      replacement: operation.text,
      cvText: input.cvText,
      jobText: input.jobText,
    });
    const unchanged = operation.text.trim() === paragraph.text.trim();

    changes.push({
      ...base,
      accepted: verdict.accepted,
      unchanged,
      reasons: verdict.accepted ? [] : verdict.reasons,
      // A rewritten paragraph keeps its first run's formatting, so mixed inline
      // formatting collapses. An omitted paragraph loses nothing.
      warnings:
        verdict.accepted && !unchanged && !paragraph.uniformFormatting
          ? ["mixed_formatting"]
          : [],
    });
  }

  return {
    changes,
    acceptedCount: changes.filter(
      (change) => change.accepted && !change.unchanged,
    ).length,
    rejectedCount: changes.filter((change) => !change.accepted).length,
  };
}

/**
 * A deterministic reading aid, not a writer. It says which paragraphs already
 * speak to the advert and which speak to neither the advert nor confirmed
 * evidence; it never proposes wording.
 */
export function suggestTailoringFocus(input: {
  paragraphs: readonly DocxParagraph[];
  jobText: string;
  confirmedConcepts: readonly string[];
}): { relevant: readonly number[]; omissionCandidates: readonly number[] } {
  const jobTerms = substantiveTerms(input.jobText);
  const conceptTerms = new Set(
    input.confirmedConcepts.flatMap((concept) => [
      ...substantiveTerms(concept),
    ]),
  );
  const relevant: number[] = [];
  const omissionCandidates: number[] = [];

  for (const paragraph of input.paragraphs) {
    const terms = substantiveTerms(paragraph.text);
    const overlapsJob = [...terms].some((term) => jobTerms.has(term));
    const overlapsEvidence = [...terms].some((term) => conceptTerms.has(term));

    if (overlapsJob) relevant.push(paragraph.index);
    else if (!overlapsEvidence) omissionCandidates.push(paragraph.index);
  }

  return { relevant, omissionCandidates };
}

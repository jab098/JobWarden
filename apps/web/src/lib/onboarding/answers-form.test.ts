import { describe, expect, it } from "vitest";

import {
  fieldsForStep,
  parsePoundsToMinorUnits,
  readStepAnswers,
  splitConceptList,
} from "./answers-form";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      data.append(name, entry);
    }
  }
  return {
    get: (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    },
    getAll: (name: string) =>
      data.getAll(name).filter((value) => typeof value === "string"),
  };
}

describe("splitConceptList", () => {
  it("accepts the separators people actually type", () => {
    expect(splitConceptList("Python, SQL\ndbt ,")).toEqual([
      "Python",
      "SQL",
      "dbt",
    ]);
  });

  it("keeps the first spelling of a repeated concept", () => {
    expect(splitConceptList("SQL, sql, Sql")).toEqual(["SQL"]);
  });

  it("treats an empty field as nothing answered", () => {
    expect(splitConceptList("   ")).toEqual([]);
  });
});

describe("parsePoundsToMinorUnits", () => {
  it("stores whole pounds as the minor units every job record uses", () => {
    expect(parsePoundsToMinorUnits("45000")).toBe(4_500_000);
  });

  it("clears the floor when the field is blank rather than pinning it at zero", () => {
    expect(parsePoundsToMinorUnits("")).toBeNull();
  });

  it("refuses text and negatives instead of coercing them", () => {
    expect(parsePoundsToMinorUnits("a lot")).toBeNull();
    expect(parsePoundsToMinorUnits("-5")).toBeNull();
  });
});

describe("fieldsForStep", () => {
  it("asks the CV path for a target role, which evidence cannot supply", () => {
    // Confirmed evidence says what someone has done, never what they want next.
    expect(fieldsForStep("cv", "preferences")).toContain("roleFamilies");
  });

  it("does not ask the aspiration path for its role twice", () => {
    expect(fieldsForStep("aspiration", "preferences")).not.toContain(
      "roleFamilies",
    );
    expect(fieldsForStep("aspiration", "aspirations")).toContain(
      "roleFamilies",
    );
  });

  it("owns no answers on the steps that ask no questions", () => {
    expect(fieldsForStep("cv", "cv")).toEqual([]);
    expect(fieldsForStep("cv", "review")).toEqual([]);
  });
});

describe("readStepAnswers", () => {
  it("records only the fields its own step controls", () => {
    const answers = readStepAnswers(
      "aspiration",
      "aspirations",
      form({
        roleFamilies: "Data analyst",
        skillConcepts: "SQL, Python",
        developingSkills: "dbt",
        targetSeniority: "mid",
        // Belongs to a later step; a stray value must not ride along, because
        // the database merge would treat it as answered.
        notificationsEnabled: "on",
      }),
    );

    expect(answers).toEqual({
      roleFamilies: ["Data analyst"],
      skillConcepts: ["SQL", "Python"],
      developingSkills: ["dbt"],
      targetSeniority: "mid",
    });
  });

  it("clears a multi-select the user emptied", () => {
    // The merge replaces whole keys, so an empty array is how "I changed my
    // mind about all of them" survives a revisit.
    const answers = readStepAnswers(
      "aspiration",
      "preferences",
      form({ ukLocations: "" }),
    );

    expect(answers?.employmentTypes).toEqual([]);
    expect(answers?.workingTimes).toEqual([]);
  });

  it("reads an unticked checkbox as an explicit no", () => {
    const answers = readStepAnswers("cv", "notifications", form({}));

    expect(answers).toEqual({
      notificationsEnabled: false,
      exploreEnabled: false,
    });
  });

  it("carries the ticked preferences through", () => {
    const answers = readStepAnswers(
      "aspiration",
      "preferences",
      form({
        employmentTypes: ["permanent", "contract"],
        workplaceTypes: "remote",
        compensationMinimum: "52000",
        compensationPeriod: "year",
        allowUnknownCompensation: "on",
      }),
    );

    expect(answers).toMatchObject({
      employmentTypes: ["permanent", "contract"],
      workplaceTypes: ["remote"],
      compensationMinimum: 5_200_000,
      compensationPeriod: "year",
      allowUnknownCompensation: true,
    });
  });

  it("refuses a value outside the vocabulary rather than storing it", () => {
    expect(
      readStepAnswers(
        "aspiration",
        "preferences",
        form({ employmentTypes: "freelance-ish" }),
      ),
    ).toBeNull();
    expect(
      readStepAnswers(
        "aspiration",
        "aspirations",
        form({ targetSeniority: "supreme" }),
      ),
    ).toBeNull();
  });
});

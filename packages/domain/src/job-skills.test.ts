import { describe, expect, it } from "vitest";

import {
  extractJobSkills,
  matchJobSkills,
  normaliseSkill,
} from "./job-skills.ts";

describe("extractJobSkills", () => {
  it("recognises skills across a realistic listing, in order of appearance", () => {
    const skills = extractJobSkills(
      "Experience with SQL, dbt and Python. Familiar with Snowflake, Databricks and Power BI.",
    );
    expect(skills).toEqual([
      "SQL",
      "dbt",
      "Python",
      "Snowflake",
      "Databricks",
      "Power BI",
    ]);
  });

  it("matches whole words only, so a skill never fires inside a longer word", () => {
    // "sql" must not fire inside "mysql"; "java" must not fire inside
    // "javascript"; each longer token resolves to its own skill instead.
    expect(extractJobSkills("We run MySQL in production.")).toEqual(["MySQL"]);
    expect(extractJobSkills("A JavaScript-only stack.")).toEqual([
      "JavaScript",
    ]);
  });

  it("handles punctuation-bearing names like C++, C# and .NET", () => {
    expect(extractJobSkills("Strong C++ and C# on .NET.")).toEqual([
      "C++",
      "C#",
      ".NET",
    ]);
  });

  it("returns nothing when no recognised skill is present", () => {
    expect(extractJobSkills("A warm and collaborative team.")).toEqual([]);
  });
});

describe("matchJobSkills", () => {
  it("flags the reader's own skills and orders by appearance", () => {
    const result = matchJobSkills(
      "You will use SQL and Snowflake, plus Power BI dashboards.",
      ["power bi", "sql"],
    );
    expect(result).toEqual([
      { label: "SQL", mine: true },
      { label: "Snowflake", mine: false },
      { label: "Power BI", mine: true },
    ]);
  });

  it("surfaces a reader skill the vocabulary does not know", () => {
    const result = matchJobSkills("Experience with tag management required.", [
      "Tag management",
    ]);
    expect(result).toEqual([{ label: "Tag management", mine: true }]);
  });

  it("does not mark a job skill the reader lacks", () => {
    expect(matchJobSkills("We use Kubernetes.", ["sql"])).toEqual([
      { label: "Kubernetes", mine: false },
    ]);
  });
});

describe("normaliseSkill", () => {
  it("lowercases and trims for comparison", () => {
    expect(normaliseSkill("  Power BI ")).toBe("power bi");
  });
});

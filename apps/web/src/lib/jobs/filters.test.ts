// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  activeJobFilters,
  createJobFiltersQueryString,
  parseJobFilters,
} from "./filters";

const defaults = parseJobFilters({});

describe("job URL filters", () => {
  it("parses valid scalar filters", () => {
    expect(
      parseJobFilters({
        q: "  platform engineer  ",
        employment: "contract",
        workingTime: "part_time",
        workplace: "remote",
        ir35: "outside",
        compensation: "advertised",
        page: "2",
      }),
    ).toEqual({
      q: "platform engineer",
      location: "",
      radius: null,
      employment: "contract",
      workingTime: "part_time",
      workplace: "remote",
      ir35: "outside",
      compensation: "advertised",
      salaryMin: null,
      salaryPeriod: "all",
      posted: "any",
      sort: "newest",
      page: 2,
    });
  });

  it("falls back for arrays instead of accepting ambiguous values", () => {
    expect(
      parseJobFilters({
        q: ["engineer", "researcher"],
        employment: ["contract"],
        workingTime: ["full_time"],
        workplace: ["remote"],
        ir35: ["inside"],
        compensation: ["advertised"],
        page: ["2"],
      }),
    ).toEqual(defaults);
  });

  it("falls back for unexpected categories", () => {
    expect(
      parseJobFilters({
        employment: "freelance",
        workingTime: "weekends",
        workplace: "moon",
        ir35: "guessed",
        compensation: "invented",
      }),
    ).toEqual(defaults);
  });

  it("falls back when trimmed search text is over 100 characters", () => {
    expect(parseJobFilters({ q: ` ${"a".repeat(101)} ` }).q).toBe("");
  });

  it.each(["0", "-1", "1001", "not-a-number", "1.5"])(
    "falls back for invalid page %s",
    (page) => {
      expect(parseJobFilters({ page }).page).toBe(1);
    },
  );

  it("applies a pay floor only with the period that makes it comparable", () => {
    // £600 a day and £60,000 a year are both "60000" without a period.
    expect(parseJobFilters({ salaryMin: "45000" })).toMatchObject({
      salaryMin: null,
      salaryPeriod: "all",
    });
    expect(parseJobFilters({ salaryPeriod: "year" })).toMatchObject({
      salaryMin: null,
      salaryPeriod: "all",
    });
    expect(
      parseJobFilters({ salaryMin: "45000", salaryPeriod: "year" }),
    ).toMatchObject({ salaryMin: 45_000, salaryPeriod: "year" });
  });

  it("reads an empty pay floor as no floor rather than zero", () => {
    expect(
      parseJobFilters({ salaryMin: "", salaryPeriod: "year" }).salaryMin,
    ).toBeNull();
  });

  it("refuses a salary period it never offers", () => {
    // A floor against an unstated period compares nothing to nothing, so
    // "unknown" is not a period a floor can be expressed in.
    expect(
      parseJobFilters({ salaryMin: "30000", salaryPeriod: "unknown" }),
    ).toMatchObject({ salaryMin: null, salaryPeriod: "all" });
  });

  it("treats a zero floor as no floor", () => {
    // £0+ narrows nothing while still hiding every unstated salary, which
    // would drop the result count for no stated reason.
    expect(
      parseJobFilters({ salaryMin: "0", salaryPeriod: "year" }),
    ).toMatchObject({ salaryMin: null, salaryPeriod: "all" });
  });

  it("falls back for a posting window or sort order it does not offer", () => {
    expect(parseJobFilters({ posted: "365" }).posted).toBe("any");
    expect(parseJobFilters({ sort: "salary" }).sort).toBe("newest");
  });

  it("does not mutate the supplied search parameter object", () => {
    const input = Object.freeze({ q: "  engineer  ", page: "3" });

    expect(parseJobFilters(input)).toMatchObject({ q: "engineer", page: 3 });
    expect(input).toEqual({ q: "  engineer  ", page: "3" });
  });
});

describe("canonical jobs query strings", () => {
  it("omits defaults and emits non-default filters in a stable key order", () => {
    expect(createJobFiltersQueryString(defaults)).toBe("");
    expect(
      createJobFiltersQueryString({
        ...defaults,
        q: "platform & data",
        location: "Leeds",
        employment: "contract",
        workingTime: "part_time",
        workplace: "remote",
        ir35: "outside",
        compensation: "unknown",
        salaryMin: 45_000,
        salaryPeriod: "year",
        posted: "7",
        sort: "closing",
        page: 3,
      }),
    ).toBe(
      "q=platform+%26+data&location=Leeds&employment=contract&workingTime=part_time" +
        "&workplace=remote&ir35=outside&compensation=unknown&salaryMin=45000" +
        "&salaryPeriod=year&posted=7&sort=closing&page=3",
    );
  });

  it("supports canonical clear and pagination query strings", () => {
    const active = parseJobFilters({
      q: "engineer",
      employment: "contract",
      page: "2",
    });

    expect(createJobFiltersQueryString({ ...active, page: 3 })).toBe(
      "q=engineer&employment=contract&page=3",
    );
    expect(createJobFiltersQueryString(defaults)).toBe("");
  });
});

describe("removable active filters", () => {
  it("reports nothing to remove on an unfiltered search", () => {
    expect(activeJobFilters(defaults)).toEqual([]);
    // Paging is not a narrowing choice, so it is not offered as one.
    expect(activeJobFilters({ ...defaults, page: 4 })).toEqual([]);
  });

  it("lifts one choice and leaves the rest of the search intact", () => {
    const filters = parseJobFilters({
      q: "engineer",
      location: "Leeds",
      employment: "contract",
      page: "3",
    });

    const location = activeJobFilters(filters).find(
      (entry) => entry.key === "location",
    );

    expect(location?.label).toBe("In Leeds");
    expect(createJobFiltersQueryString(location!.clearedFilters)).toBe(
      "q=engineer&employment=contract",
    );
  });

  it("removes a pay floor and its period together", () => {
    const filters = parseJobFilters({
      salaryMin: "45000",
      salaryPeriod: "year",
    });
    const salary = activeJobFilters(filters).find(
      (entry) => entry.key === "salary",
    );

    expect(salary?.label).toBe("£45,000+ per year");
    expect(createJobFiltersQueryString(salary!.clearedFilters)).toBe("");
  });
});

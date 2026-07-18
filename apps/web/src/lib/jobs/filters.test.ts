// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createJobFiltersQueryString, parseJobFilters } from "./filters";

const defaults = {
  q: "",
  employment: "all" as const,
  workingTime: "all" as const,
  workplace: "all" as const,
  ir35: "all" as const,
  compensation: "all" as const,
  page: 1,
};

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
      employment: "contract",
      workingTime: "part_time",
      workplace: "remote",
      ir35: "outside",
      compensation: "advertised",
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
        q: "platform & data",
        employment: "contract",
        workingTime: "part_time",
        workplace: "remote",
        ir35: "outside",
        compensation: "unknown",
        page: 3,
      }),
    ).toBe(
      "q=platform+%26+data&employment=contract&workingTime=part_time&workplace=remote&ir35=outside&compensation=unknown&page=3",
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

import { describe, expect, it } from "vitest";

import { sourceAttribution } from "./source-attribution.ts";

describe("sourceAttribution", () => {
  it("credits Adzuna with the exact required wording", () => {
    expect(sourceAttribution("adzuna")).toBe("Jobs by Adzuna");
  });

  it("attributes nothing for a source that needs no credit", () => {
    expect(sourceAttribution("greenhouse")).toBeNull();
    expect(sourceAttribution("teaching_vacancies")).toBeNull();
  });

  it("attributes nothing when the provider is missing", () => {
    expect(sourceAttribution(null)).toBeNull();
    expect(sourceAttribution(undefined)).toBeNull();
  });
});

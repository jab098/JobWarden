import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExploreResult, ExploreSuggestionItem } from "@/lib/explore/types";

import { ExploreView } from "./explore-view";

vi.mock("@/app/(protected)/pathways/actions", () => ({
  setExploreEnabledAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
  decidePathwayAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
  promotePathwayAction: vi.fn(async () => ({
    kind: "success",
    message: "Saved.",
  })),
}));

function item(
  overrides: Partial<ExploreSuggestionItem["suggestion"]> = {},
): ExploreSuggestionItem {
  return {
    decision: null,
    suggestion: {
      pathway: {
        normalizedConcept: "product analytics implementation",
        label: "Product analytics implementation",
        summary: "Fictional summary for tests.",
      },
      overlapPercent: 71,
      matchedSkills: [
        {
          normalizedConcept: "event instrumentation",
          label: "Event instrumentation",
          significant: true,
          evidenceLabels: ["Event instrumentation"],
          evidenceCategories: ["skill"],
        },
        {
          normalizedConcept: "analytics implementation",
          label: "Analytics implementation",
          significant: true,
          evidenceLabels: ["Analytics implementation (CV)"],
          evidenceCategories: ["responsibility"],
        },
      ],
      gaps: [
        { label: "SQL", significant: false },
        { label: "Behavioural data pipelines", significant: true },
      ],
      ...overrides,
    },
  };
}

function result(overrides: Partial<ExploreResult> = {}): ExploreResult {
  return {
    enabled: true,
    items: [item()],
    dismissed: [],
    dataMode: "fixtures",
    ...overrides,
  };
}

afterEach(cleanup);

describe("explore experience", () => {
  it("explains the opt-in and offers an enable control while disabled", async () => {
    const { container } = render(
      <ExploreView result={result({ enabled: false, items: [] })} />,
    );

    expect(
      screen.getByRole("heading", { name: "Career pathways" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/opt-in/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Turn on pathways" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows overlap, matched evidence, gaps, and controls for a suggestion", async () => {
    const { container } = render(<ExploreView result={result()} />);

    expect(
      screen.getByRole("heading", { name: "Product analytics implementation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Overlap 71%" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Analytics implementation (CV)"),
    ).toBeInTheDocument();
    expect(screen.getByText("SQL")).toBeInTheDocument();
    expect(screen.getByText("Behavioural data pipelines")).toBeInTheDocument();
    expect(screen.getAllByText(/significant/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Promote to search profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn off pathways" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("explains an honest empty state without blaming the user", () => {
    render(<ExploreView result={result({ items: [] })} />);

    expect(screen.getByText(/70% weighted overlap/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no more than two significant gaps/i),
    ).toBeInTheDocument();
  });

  it("lists dismissed pathways with a restore control", () => {
    render(
      <ExploreView
        result={result({
          items: [],
          dismissed: [{ ...item(), decision: "dismissed" }],
        })}
      />,
    );

    expect(screen.getByText(/dismissed pathways/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("submits a dismissal through the pathway action", async () => {
    const { decidePathwayAction } =
      await import("@/app/(protected)/pathways/actions");
    const user = userEvent.setup();
    render(<ExploreView result={result()} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(decidePathwayAction).toHaveBeenCalled();
    const formData = vi.mocked(decidePathwayAction).mock
      .calls[0]?.[1] as FormData;
    expect(formData.get("pathwayConcept")).toBe(
      "product analytics implementation",
    );
    expect(formData.get("decision")).toBe("dismissed");
  });
});

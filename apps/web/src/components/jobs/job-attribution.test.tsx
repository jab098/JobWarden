import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobAttribution } from "./job-attribution";

describe("JobAttribution", () => {
  it("renders the required credit for an Adzuna listing", () => {
    render(<JobAttribution sourceProvider="adzuna" />);
    expect(screen.getByText("Jobs by Adzuna")).toBeInTheDocument();
  });

  it("renders nothing for a source that needs no credit", () => {
    const { container } = render(
      <JobAttribution sourceProvider="greenhouse" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the provider is absent", () => {
    const { container } = render(<JobAttribution sourceProvider={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

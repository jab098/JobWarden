import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const actionMocks = vi.hoisted(() => ({
  saveVariantAction: vi.fn(),
  promoteVariantAction: vi.fn(),
  deleteVariantAction: vi.fn(),
}));
vi.mock("@/app/(protected)/tailor/[jobId]/actions", () => actionMocks);

import { TailoringWorkspaceView } from "@/components/tailoring/tailoring-workspace";
import { createDevelopmentTailoringRepository } from "@/lib/tailoring/development-tailoring";
import { developmentJobs } from "@/lib/jobs/development-jobs";
import type { TailoringWorkspace } from "@/lib/tailoring/types";

const fictional = await createDevelopmentTailoringRepository().getWorkspace(
  developmentJobs[0]!.id,
);

function workspace(
  overrides: Partial<TailoringWorkspace> = {},
): TailoringWorkspace {
  return { ...fictional, dataMode: "supabase", ...overrides };
}

beforeEach(() => {
  actionMocks.saveVariantAction
    .mockReset()
    .mockResolvedValue({ kind: "success", message: "Draft saved." });
  actionMocks.promoteVariantAction
    .mockReset()
    .mockResolvedValue({ kind: "success", message: "Variant saved." });
  actionMocks.deleteVariantAction
    .mockReset()
    .mockResolvedValue({ kind: "success", message: "Variant deleted." });
});

describe("TailoringWorkspaceView", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(
      <TailoringWorkspaceView workspace={workspace()} />,
    );

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  it("states that the original document is never modified", () => {
    render(<TailoringWorkspaceView workspace={workspace()} />);

    expect(
      screen.getByText(/Your original file is never modified/),
    ).toBeInTheDocument();
  });

  it("lists every paragraph of the source document", () => {
    render(<TailoringWorkspaceView workspace={workspace()} />);

    expect(screen.getAllByText(/^Paragraph \d+$/).length).toBe(
      fictional.paragraphs.length,
    );
  });

  it("blocks a figure that the CV does not contain", async () => {
    const user = userEvent.setup();
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    const field = screen.getByLabelText(/Replacement wording for paragraph 4/);
    await user.clear(field);
    await user.type(
      field,
      "Owned data quality governance and reduced reporting defects by 90 percent.",
    );

    expect(
      await screen.findByText(/“90” does not appear in your CV/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save draft/ })).toBeDisabled();
  });

  it("blocks a tool that appears in neither the CV nor the advert", async () => {
    const user = userEvent.setup();
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    const field = screen.getByLabelText(/Replacement wording for paragraph 8/);
    await user.clear(field);
    await user.type(field, "Tools: SQL, Python, dbt, Snowplow, Kubernetes.");

    expect(
      await screen.findByText(/“kubernetes” appears in neither/),
    ).toBeInTheDocument();
  });

  it("accepts a rewording drawn from the CV and the advert", async () => {
    const user = userEvent.setup();
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    const field = screen.getByLabelText(/Replacement wording for paragraph 3/);
    await user.clear(field);
    await user.type(field, "Built analytics implementation for 12 teams.");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save draft/ })).toBeEnabled(),
    );
  });

  it("records an omission in the change summary", async () => {
    const user = userEvent.setup();
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    const checkboxes = screen.getAllByRole("checkbox", {
      name: "Leave this paragraph out",
    });
    await user.click(checkboxes[9]!);

    const summary = screen.getByRole("complementary");
    expect(
      within(summary).getByText(/Paragraph 10: left out/),
    ).toBeInTheDocument();
  });

  it("submits the operations it displayed", async () => {
    const user = userEvent.setup();
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    await user.click(
      screen.getAllByRole("checkbox", { name: "Leave this paragraph out" })[9]!,
    );
    await user.click(screen.getByRole("button", { name: /Save draft/ }));

    await waitFor(() =>
      expect(actionMocks.saveVariantAction).toHaveBeenCalled(),
    );
    const [, formData] = actionMocks.saveVariantAction.mock.calls[0];
    expect(JSON.parse(String(formData.get("operations")))).toEqual([
      { paragraphIndex: 9, kind: "omit" },
    ]);
  });

  it("warns when a rewritten paragraph mixes inline formatting", async () => {
    const user = userEvent.setup();
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    const field = screen.getByLabelText(/Replacement wording for paragraph 2/);
    await user.clear(field);
    await user.type(field, "Fictionex Ltd, London. Analytics Engineer.");

    expect(
      await screen.findByText(/keeps the first run’s formatting/),
    ).toBeInTheDocument();
  });

  it("cannot save when nothing has changed", () => {
    render(<TailoringWorkspaceView workspace={workspace({ variant: null })} />);

    expect(screen.getByRole("button", { name: /Save draft/ })).toBeDisabled();
    expect(screen.getByText(/No changes yet/)).toBeInTheDocument();
  });

  it("says a draft expires and a saved variant does not", () => {
    const { rerender } = render(
      <TailoringWorkspaceView workspace={workspace()} />,
    );
    expect(
      screen.getByText(/deleted automatically 24 hours/),
    ).toBeInTheDocument();

    rerender(
      <TailoringWorkspaceView
        workspace={workspace({
          variant: { ...fictional.variant!, status: "saved", expiresAt: null },
        })}
      />,
    );
    expect(screen.getByText(/kept until you delete it/)).toBeInTheDocument();
  });

  it("offers a download link for an existing variant", () => {
    render(<TailoringWorkspaceView workspace={workspace()} />);

    expect(
      screen.getByRole("link", { name: "Download tailored DOCX" }),
    ).toHaveAttribute(
      "href",
      `/tailor/${fictional.job.id}/download?variantId=${fictional.variant!.id}`,
    );
  });

  it("refuses mutation in the fictional preview", () => {
    render(
      <TailoringWorkspaceView
        workspace={workspace({ dataMode: "fixtures" })}
      />,
    );

    expect(screen.getByRole("button", { name: /Save draft/ })).toBeDisabled();
    expect(
      screen.getByText(/uses a fictional CV and cannot save changes/),
    ).toBeInTheDocument();
  });

  it("explains that a PDF-only CV cannot preserve layout", () => {
    render(
      <TailoringWorkspaceView
        workspace={workspace({
          source: { available: false, reason: "pdf_only" },
          paragraphs: [],
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "A DOCX CV is required" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your current CV is a PDF/)).toBeInTheDocument();
  });

  it("explains the missing-CV case separately", () => {
    render(
      <TailoringWorkspaceView
        workspace={workspace({
          source: { available: false, reason: "no_cv" },
          paragraphs: [],
        })}
      />,
    );

    expect(
      screen.getByText(/Add a DOCX CV to your career profile/),
    ).toBeInTheDocument();
  });
});

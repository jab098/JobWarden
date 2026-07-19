import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const actionMocks = vi.hoisted(() => ({
  advanceOnboardingAction: vi.fn(),
  completeOnboardingAction: vi.fn(),
}));
vi.mock("@/app/(onboarding)/onboarding/actions", () => actionMocks);

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import type { OnboardingView } from "@/lib/onboarding/types";

function view(overrides: Partial<OnboardingView> = {}): OnboardingView {
  return {
    state: { path: "cv", completedSteps: [], completedAt: null },
    currentStep: "cv",
    path: "cv",
    cvOutcome: "rich",
    cv: { present: true, kind: "docx", conceptCount: 14 },
    complete: false,
    answers: { roleFamilies: ["Analytics implementation"] },
    evidence: [],
    hasSignal: true,
    dataMode: "supabase",
    ...overrides,
  };
}

beforeEach(() => {
  actionMocks.advanceOnboardingAction
    .mockReset()
    .mockResolvedValue({ kind: "success", message: "Saved." });
  actionMocks.completeOnboardingAction
    .mockReset()
    .mockResolvedValue({ kind: "success", message: "Done." });
});

describe("OnboardingFlow", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(<OnboardingFlow view={view()} />);

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  it("offers a no-CV route so a student is never locked out", () => {
    render(<OnboardingFlow view={view()} />);

    expect(
      screen.getByRole("button", { name: "I do not have a CV yet" }),
    ).toBeEnabled();
  });

  it("sends the aspiration path when the user has no CV", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow view={view()} />);

    await user.click(
      screen.getByRole("button", { name: "I do not have a CV yet" }),
    );

    const [, formData] = actionMocks.advanceOnboardingAction.mock.calls[0];
    expect(formData.get("path")).toBe("aspiration");
    expect(formData.get("cvOutcome")).toBe("none");
  });

  it.each([
    ["failed", /could not read that file/],
    ["thin", /could not get much from that file/],
    ["none", /plenty of people start here/],
    ["rich_pdf_only", /A DOCX would also let you/],
  ])("explains the %s outcome honestly", (cvOutcome, copy) => {
    render(
      <OnboardingFlow
        view={view({ cvOutcome: cvOutcome as OnboardingView["cvOutcome"] })}
      />,
    );

    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("distinguishes an unreadable file from a thin one", () => {
    render(<OnboardingFlow view={view({ cvOutcome: "failed" })} />);

    expect(screen.getByText(/your file is untouched/)).toBeInTheDocument();
  });

  it("does not offer the CV route when no CV exists", () => {
    // Sending the user down the confirm path with nothing to confirm is a dead
    // end, so the only offer is the one that actually works.
    render(
      <OnboardingFlow
        view={view({
          cv: { present: false, kind: null, conceptCount: 0 },
          cvOutcome: "none",
          path: "aspiration",
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Continue with my CV" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue without a CV" }),
    ).toBeEnabled();
  });

  it("keeps the CV route on the path the outcome selected", async () => {
    // A thin or unreadable CV routes to aspirations; continuing must not drop
    // the user back onto a confirm step that has nothing to show.
    const user = userEvent.setup();
    render(
      <OnboardingFlow view={view({ cvOutcome: "thin", path: "aspiration" })} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continue with my CV" }),
    );

    const [, formData] = actionMocks.advanceOnboardingAction.mock.calls[0];
    expect(formData.get("path")).toBe("aspiration");
    expect(formData.get("cvOutcome")).toBe("thin");
  });

  it("shows the aspiration step for a user without experience", () => {
    render(
      <OnboardingFlow
        view={view({ path: "aspiration", currentStep: "aspirations" })}
      />,
    );

    expect(screen.getByText(/No experience is required/)).toBeInTheDocument();
  });

  it("shows progress against the steps of the active path only", () => {
    render(
      <OnboardingFlow
        view={view({ path: "aspiration", currentStep: "aspirations" })}
      />,
    );

    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    expect(screen.queryByText("What we read")).not.toBeInTheDocument();
  });

  it("marks the current step for assistive technology", () => {
    render(<OnboardingFlow view={view({ currentStep: "preferences" })} />);

    const current = screen
      .getByRole("list", { name: "Onboarding progress" })
      .querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent("What you will and will not take");
  });

  it("promises preferences become removable filters", () => {
    render(<OnboardingFlow view={view({ currentStep: "preferences" })} />);

    expect(screen.getByText(/lift at any time/)).toBeInTheDocument();
  });

  it("says notifications are off unless turned on", () => {
    render(<OnboardingFlow view={view({ currentStep: "notifications" })} />);

    expect(screen.getByText(/off unless you turn it on/)).toBeInTheDocument();
  });

  it("offers to finish only once every step is done", () => {
    render(<OnboardingFlow view={view({ currentStep: null })} />);

    expect(
      screen.getByRole("button", { name: "Finish and open my feed" }),
    ).toBeEnabled();
  });

  it("refuses to finish with nothing to match on, and says why", () => {
    // Finishing here would unlock a hub showing an empty feed and no reason.
    render(
      <OnboardingFlow view={view({ currentStep: null, hasSignal: false })} />,
    );

    expect(
      screen.getByRole("button", { name: "Finish and open my feed" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /something to match you on/,
    );
  });

  it("promises the applied filters are visible and liftable", () => {
    render(<OnboardingFlow view={view({ currentStep: null })} />);

    expect(screen.getByText(/one click from being lifted/)).toBeInTheDocument();
  });

  it("says every choice stays editable afterwards", () => {
    render(<OnboardingFlow view={view()} />);

    expect(
      screen.getByText(/can be changed later from your career profile/),
    ).toBeInTheDocument();
  });

  it("refuses to save in the fictional preview", () => {
    render(<OnboardingFlow view={view({ dataMode: "fixtures" })} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/cannot save progress/)).toBeInTheDocument();
  });
});

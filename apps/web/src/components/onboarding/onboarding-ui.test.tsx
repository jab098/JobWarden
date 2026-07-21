import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// CvReadingNotice polls with router.refresh() while a CV is being read.
const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

const actionMocks = vi.hoisted(() => ({
  advanceOnboardingAction: vi.fn(),
  completeOnboardingAction: vi.fn(),
  goBackOnboardingAction: vi.fn(),
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
    cv: { present: true, kind: "docx", conceptCount: 14, ready: true },
    complete: false,
    answers: { roleFamilies: ["Analytics implementation"] },
    evidence: [],
    hasSignal: true,
    generation: 0,
    uploadCapability: { enabled: false, reason: "uploads_disabled" },
    canAdvance: true,
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
          cv: { present: false, kind: null, conceptCount: 0, ready: false },
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

  it("leaves both opt-ins unticked until the user chooses them", () => {
    render(<OnboardingFlow view={view({ currentStep: "notifications" })} />);

    expect(screen.getByText(/off unless you choose them/)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Email me when genuinely new/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /adjacent careers/ }),
    ).not.toBeChecked();
  });

  it("submits the answers alongside the step that asked for them", async () => {
    // The step used to record only that it happened, so every answer the
    // profile builder needed arrived empty.
    const user = userEvent.setup();
    render(
      <OnboardingFlow
        view={view({
          path: "aspiration",
          currentStep: "aspirations",
          answers: {},
        })}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /kind of work are you aiming for/ }),
      "Data analyst",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Skills you already have/ }),
      "SQL, Excel",
    );
    await user.click(
      screen.getByRole("combobox", { name: /level you are aiming for/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Mid level" }));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    const [, formData] = actionMocks.advanceOnboardingAction.mock.calls[0];
    expect(formData.get("step")).toBe("aspirations");
    expect(formData.get("roleFamilies")).toBe("Data analyst");
    expect(formData.get("skillConcepts")).toBe("SQL, Excel");
    expect(formData.get("targetSeniority")).toBe("mid");
  });

  it("pre-fills a revisited step from the answers already given", () => {
    render(
      <OnboardingFlow
        view={view({
          path: "aspiration",
          currentStep: "preferences",
          answers: {
            employmentTypes: ["permanent"],
            ukLocations: ["Manchester", "Leeds"],
            compensationMinimum: 4_500_000,
          },
        })}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Permanent" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Contract" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("textbox", { name: /Where in the UK/ }),
    ).toHaveValue("Manchester, Leeds");
    // Stored in minor units, shown as the pounds the advert would state.
    expect(
      screen.getByRole("spinbutton", { name: /Lowest pay you would accept/ }),
    ).toHaveValue(45000);
  });

  it("asks the CV path for a target role, which evidence cannot supply", () => {
    render(<OnboardingFlow view={view({ currentStep: "preferences" })} />);

    expect(
      screen.getByRole("textbox", { name: /kind of work are you aiming for/ }),
    ).toBeInTheDocument();
  });

  it("does not ask the aspiration path for its role a second time", () => {
    render(
      <OnboardingFlow
        view={view({ path: "aspiration", currentStep: "preferences" })}
      />,
    );

    expect(
      screen.queryByRole("textbox", {
        name: /kind of work are you aiming for/,
      }),
    ).not.toBeInTheDocument();
  });

  it("includes unstated salaries unless the user opts out", () => {
    // Most UK adverts state no salary; defaulting this off would hide them.
    render(
      <OnboardingFlow
        view={view({ path: "aspiration", currentStep: "preferences" })}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: /do not state a salary/ }),
    ).toBeChecked();
  });

  it("lets the confirmation step decide what the first search is built from", () => {
    render(
      <OnboardingFlow
        view={view({
          currentStep: "confirm_evidence",
          evidence: [
            {
              id: "3f1f6c30-3b0a-4a37-9a3e-3f0a5c2f9a10",
              category: "skill",
              label: "SQL",
              normalizedConcept: "sql",
              evidenceExcerpt: null,
              evidenceReference: null,
              confidence: 0.9,
              lastUsedAt: null,
              confirmationState: "proposed",
              origin: "cv",
              proficiencySignal: "stated",
            },
          ] as unknown as OnboardingView["evidence"],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm SQL" })).toBeEnabled();
  });

  it("never nests the evidence decision forms inside the step form", () => {
    // A nested form is invalid HTML: the browser drops the inner one, and
    // Confirm silently becomes "advance past this step" instead.
    const { container } = render(
      <OnboardingFlow
        view={view({
          currentStep: "confirm_evidence",
          evidence: [
            {
              id: "3f1f6c30-3b0a-4a37-9a3e-3f0a5c2f9a10",
              category: "skill",
              label: "SQL",
              normalizedConcept: "sql",
              evidenceExcerpt: null,
              evidenceReference: "Fictional CV",
              confidence: 0.9,
              lastUsedAt: null,
              confirmationState: "proposed",
              origin: "cv",
              proficiencySignal: "working",
            },
          ] as unknown as OnboardingView["evidence"],
        })}
      />,
    );

    expect(container.querySelector("form form")).toBeNull();
  });

  it("offers to finish only once every step is done", () => {
    render(<OnboardingFlow view={view({ currentStep: null })} />);

    expect(
      screen.getByRole("button", { name: "Finish and open my hub" }),
    ).toBeEnabled();
  });

  it("refuses to finish with nothing to match on, and says why", () => {
    // Finishing here would unlock a hub showing an empty feed and no reason.
    render(
      <OnboardingFlow view={view({ currentStep: null, hasSignal: false })} />,
    );

    expect(
      screen.getByRole("button", { name: "Finish and open my hub" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /something to match you on/,
    );
  });

  it("says where the chosen preferences actually live afterwards", () => {
    // They shape matching through the saved search profile, and are edited
    // from the career profile — not carried as URL filters on a landing page.
    render(<OnboardingFlow view={view({ currentStep: null })} />);

    expect(
      screen.getByText(/editable from your career profile/),
    ).toBeInTheDocument();
  });

  it("says every choice stays editable afterwards", () => {
    render(<OnboardingFlow view={view()} />);

    expect(
      screen.getByText(/can be changed later from your career profile/),
    ).toBeInTheDocument();
  });

  it("refuses to save in the frozen fictional preview", () => {
    render(
      <OnboardingFlow
        view={view({ dataMode: "fixtures", canAdvance: false })}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText(/cannot save progress/)).toBeInTheDocument();
  });

  it("lets the review walkthrough move between steps without saving anything", () => {
    render(
      <OnboardingFlow
        view={view({ dataMode: "fixtures", canAdvance: true })}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeEnabled();
    }
    expect(
      screen.getByText(/nothing is saved to a real account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /restart the walkthrough/i }),
    ).toHaveAttribute("href", "/development/journey?restart=1");
  });

  /**
   * Task 27. A report held that this flow attached no React fiber and that
   * every client effect inside it was inert, leaving the buttons working only
   * through progressive enhancement. It was not reproducible: at the commit it
   * cited, submitting a step left `window` intact and raised no new document
   * navigation, so React had intercepted the submit.
   *
   * What was genuinely missing is this test. `"use client"` itself needs no
   * test — a React hook in a server component fails the production build that
   * `pnpm verify` already runs. A hydration *mismatch* is the uncovered risk:
   * React discards the server HTML, re-renders on the client, and nothing
   * fails. `Enter` carries a deliberate `suppressHydrationWarning` for its
   * one class swap, which is exactly the kind of place a real mismatch could
   * hide behind an intended one.
   *
   * So this asserts the outcome rather than the mechanism, per
   * `docs/standards/frontend-traps.md`: real server markup, a real hydration
   * against it, and a client effect inside the subtree proving it took.
   */
  it("hydrates against its own server markup and runs a client effect inside", async () => {
    const element = <OnboardingFlow view={view()} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    window.sessionStorage.clear();

    const recoverableErrors: string[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, element, {
        onRecoverableError: (error) => {
          recoverableErrors.push(String(error));
        },
      });
    });

    // `Enter`'s effect only runs once a fiber is committed to this subtree, so
    // the recorded surface key is the cheapest honest proof of hydration.
    expect(window.sessionStorage.getItem("jobwarden:seen-surfaces")).toContain(
      "onboarding-cv-cv",
    );
    // A mismatch would be recovered silently; failing here is the whole point.
    expect(recoverableErrors).toEqual([]);

    root?.unmount();
    container.remove();
  });

  // Requested by an owner who reached a later step, needed to replace the CV
  // given at step 1, and found every answer final the moment it was given.
  describe("going back", () => {
    it("offers no way back from the first step", () => {
      render(
        <OnboardingFlow
          view={view({
            state: { path: "cv", completedSteps: [], completedAt: null },
            currentStep: "cv",
          })}
        />,
      );
      expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    });

    it("names the step it returns to", () => {
      render(
        <OnboardingFlow
          view={view({
            state: {
              path: "cv",
              completedSteps: ["cv", "confirm_evidence"],
              completedAt: null,
            },
            currentStep: "preferences",
          })}
        />,
      );
      expect(
        screen.getByRole("button", { name: /^Back to/ }),
      ).toBeInTheDocument();
    });

    it("offers a way back from the review step", () => {
      render(
        <OnboardingFlow
          view={view({
            state: {
              path: "cv",
              completedSteps: [
                "cv",
                "confirm_evidence",
                "preferences",
                "notifications",
                "review",
              ],
              completedAt: null,
            },
            currentStep: null,
          })}
        />,
      );
      expect(
        screen.getByRole("button", { name: /^Back to/ }),
      ).toBeInTheDocument();
    });

    // The fictional preview writes nothing, so it must not offer a control
    // that would appear to rewind something.
    it("offers no way back in the read-only preview", () => {
      render(
        <OnboardingFlow
          view={view({
            state: {
              path: "cv",
              completedSteps: ["cv", "confirm_evidence"],
              completedAt: null,
            },
            currentStep: "preferences",
            dataMode: "fixtures",
          })}
        />,
      );
      expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    });
  });

  // Found by an owner whose CV extracted successfully and who was still shown
  // an empty form asking them to type everything in by hand.
  describe("continuing with a CV", () => {
    it("sends the path the CV implies, not the one chosen before it existed", () => {
      const { container } = render(
        <OnboardingFlow
          view={view({
            // Chose "no CV" first, then uploaded one. The stored path is stale.
            path: "aspiration",
            cvOutcome: "rich",
            cv: { present: true, kind: "docx", conceptCount: 9, ready: true },
            currentStep: "cv",
            state: {
              path: "aspiration",
              completedSteps: [],
              completedAt: null,
            },
          })}
        />,
      );

      const withCv = [...container.querySelectorAll("form")].find((form) =>
        form.textContent?.includes("Continue with my CV"),
      );
      expect(
        withCv?.querySelector<HTMLInputElement>('input[name="path"]')?.value,
      ).toBe("cv");
    });

    // A document row exists the moment the file lands, long before extraction
    // finishes. Continuing then carries the reader past their own CV.
    it("cannot be pressed while the CV is still being read", () => {
      render(
        <OnboardingFlow
          view={view({
            cvOutcome: "rich",
            cv: { present: true, kind: "docx", conceptCount: 0, ready: false },
            currentStep: "cv",
          })}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Continue with my CV" }),
      ).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent(/Reading your CV/i);
    });

    it("can be pressed once the CV has been read", () => {
      render(
        <OnboardingFlow
          view={view({
            cvOutcome: "rich",
            cv: { present: true, kind: "docx", conceptCount: 9, ready: true },
            currentStep: "cv",
          })}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Continue with my CV" }),
      ).toBeEnabled();
      expect(screen.queryByText(/Reading your CV/i)).toBeNull();
    });
  });
});

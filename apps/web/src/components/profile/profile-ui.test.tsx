import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/profile/actions", () => ({
  saveProfileDraftAction: vi.fn(async () => ({ kind: "success" })),
  decideSuggestionAction: vi.fn(async () => ({ kind: "success" })),
  saveSearchProfileAction: vi.fn(async () => ({ kind: "success" })),
  deleteCvAction: vi.fn(async () => ({ kind: "success" })),
  deleteProfileDataAction: vi.fn(async () => ({ kind: "success" })),
}));

import ProfileError from "@/app/(protected)/profile/error";
import ProfileLoading from "@/app/(protected)/profile/loading";
import { AppShell } from "@/components/app-shell";
import { ProfileOnboarding } from "@/components/profile/profile-onboarding";
import { createDevelopmentProfileRepository } from "@/lib/profile/development-profile";
import type { ProfileSnapshot } from "@/lib/profile/types";

let fictionalSnapshot: ProfileSnapshot;

beforeAll(async () => {
  fictionalSnapshot = await createDevelopmentProfileRepository().getSnapshot();
});

const emptySnapshot: ProfileSnapshot = {
  draft: null,
  currentCv: null,
  suggestions: [],
  searches: [],
  uploadCapability: {
    enabled: false,
    reason: "live_auth_and_storage_verification_required",
  },
  dataMode: "supabase",
};

describe("career profile onboarding", () => {
  it("renders the complete fictional review flow without a live upload control", async () => {
    const { container } = render(
      <ProfileOnboarding snapshot={fictionalSnapshot} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Career profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fictional profile preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Current seniority")).toBeDisabled();
    expect(screen.getByLabelText("Target seniority")).toBeDisabled();
    expect(
      screen.getByText("Real CV upload is unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload CV")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Evidence to review" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Analytics implementation")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Suggested direction" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Implementation leadership")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save career direction" }),
    ).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("supports an empty non-fictional onboarding state and adding explicit skills", async () => {
    const user = userEvent.setup();
    render(<ProfileOnboarding snapshot={emptySnapshot} />);

    expect(screen.getByText("Start with what you know")).toBeInTheDocument();
    expect(screen.getByLabelText("Target role families")).toBeEnabled();
    await user.type(screen.getByLabelText("Add a skill"), "Data governance");
    await user.click(screen.getByRole("button", { name: "Add skill" }));
    expect(
      screen.getAllByText("Data governance", { selector: "li span" }),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Remove Data governance" }),
    ).toBeInTheDocument();
  });

  it("wraps long user-controlled concepts instead of widening the page", () => {
    const longSnapshot: ProfileSnapshot = {
      ...fictionalSnapshot,
      draft: fictionalSnapshot.draft
        ? {
            ...fictionalSnapshot.draft,
            targetRoleFamilies: [
              {
                normalizedConcept: `a${"b".repeat(110)}`,
                label: `A${"b".repeat(110)}`,
              },
            ],
          }
        : null,
    };
    render(<ProfileOnboarding snapshot={longSnapshot} />);
    expect(screen.getByLabelText("Target role families")).toHaveClass(
      "[overflow-wrap:anywhere]",
    );
  });

  it("provides designed loading and recoverable error states", () => {
    const { rerender } = render(<ProfileLoading />);
    expect(
      screen.getByText("Preparing your career profile"),
    ).toBeInTheDocument();

    const reset = vi.fn();
    rerender(
      <ProfileError error={new Error("private details")} reset={reset} />,
    );
    expect(
      screen.getByRole("heading", { name: "Career profile is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private details")).not.toBeInTheDocument();
  });

  it("adds Career profile to desktop and mobile navigation", () => {
    render(
      <AppShell dataMode="fixtures">
        <p>Content</p>
      </AppShell>,
    );
    expect(
      screen.getAllByRole("link", { name: "Career profile" }),
    ).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Jobs" })).not.toHaveLength(0);
  });
});

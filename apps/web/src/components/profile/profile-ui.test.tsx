import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const actionMocks = vi.hoisted(() => ({
  saveProfileDraftAction: vi.fn(),
  saveSearchProfileAction: vi.fn(),
  deleteProfileDataAction: vi.fn(),
}));
vi.mock("@/app/(protected)/profile/actions", () => ({
  saveProfileDraftAction: actionMocks.saveProfileDraftAction,
  decideSuggestionAction: vi.fn(async () => ({ kind: "success" })),
  decideEvidenceAction: vi.fn(async () => ({ kind: "success" })),
  saveSearchProfileAction: actionMocks.saveSearchProfileAction,
  deleteCvAction: vi.fn(async () => ({ kind: "success" })),
  deleteProfileDataAction: actionMocks.deleteProfileDataAction,
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

beforeEach(() => {
  actionMocks.saveProfileDraftAction.mockReset().mockResolvedValue({
    kind: "success",
    message: "Career direction saved.",
  });
  actionMocks.saveSearchProfileAction.mockReset().mockResolvedValue({
    kind: "success",
    message: "Named search saved.",
  });
  actionMocks.deleteProfileDataAction.mockReset().mockResolvedValue({
    kind: "success",
    message: "Career profile data deleted.",
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const emptySnapshot: ProfileSnapshot = {
  generation: 0,
  draft: null,
  evidence: [],
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
    expect(screen.getByRole("button", { name: "Confirm SQL" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exclude SQL" })).toBeDisabled();
    const searchDraft = JSON.parse(
      (container.querySelector('input[name="search"]') as HTMLInputElement)
        .value,
    ) as { skillConcepts: string[]; responsibilityConcepts: string[] };
    expect(searchDraft.skillConcepts).toEqual([
      "stakeholder management",
      "sql",
    ]);
    expect(searchDraft.responsibilityConcepts).toEqual([
      "analytics implementation",
    ]);
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

  it("does not duplicate a concept that already exists as extracted evidence", async () => {
    const user = userEvent.setup();
    const editableSnapshot: ProfileSnapshot = {
      ...fictionalSnapshot,
      dataMode: "supabase",
      uploadCapability: {
        enabled: false,
        reason: "live_auth_and_storage_verification_required",
      },
    };
    const { container } = render(
      <ProfileOnboarding snapshot={editableSnapshot} />,
    );

    await user.type(screen.getByLabelText("Add a skill"), "SQL");
    await user.click(screen.getByRole("button", { name: "Add skill" }));
    const profileDraft = JSON.parse(
      (container.querySelector('input[name="draft"]') as HTMLInputElement)
        .value,
    ) as { evidence: unknown[] };
    expect(profileDraft.evidence).toHaveLength(
      fictionalSnapshot.evidence.length,
    );
  });

  it("remounts to an empty identity after deletion so controlled personal data cannot be resubmitted", async () => {
    const user = userEvent.setup();
    const editableSnapshot: ProfileSnapshot = {
      ...fictionalSnapshot,
      dataMode: "supabase",
      uploadCapability: emptySnapshot.uploadCapability,
    };
    const { container, rerender } = render(
      <ProfileOnboarding snapshot={editableSnapshot} />,
    );
    await user.clear(screen.getByLabelText("Target role families"));
    await user.type(
      screen.getByLabelText("Target role families"),
      "Private draft direction",
    );
    await user.type(
      screen.getByLabelText("Add a skill"),
      "Private draft skill",
    );
    await user.click(screen.getByRole("button", { name: "Add skill" }));

    rerender(<ProfileOnboarding snapshot={emptySnapshot} />);

    expect(screen.getByLabelText("Target role families")).toHaveValue("");
    expect(screen.getByLabelText("Add a skill")).toHaveValue("");
    expect(screen.queryByText("Private draft skill")).not.toBeInTheDocument();
    expect(
      (container.querySelector('input[name="draft"]') as HTMLInputElement)
        .value,
    ).not.toContain("Private draft");
  });

  it("keeps accepted and rejected suggestions visible with durable semantic labels", () => {
    render(<ProfileOnboarding snapshot={fictionalSnapshot} />);

    expect(
      screen.getByText("Accepted", { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rejected", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("edits an explicitly selected stable search ID", async () => {
    const user = userEvent.setup();
    const secondSearch = {
      ...fictionalSnapshot.searches[0]!,
      id: "63000000-0000-4000-8000-000000000002",
      name: "Second explicit search",
      includeTerms: ["second"],
    };
    const snapshot = {
      ...fictionalSnapshot,
      dataMode: "supabase" as const,
      uploadCapability: emptySnapshot.uploadCapability,
      searches: [...fictionalSnapshot.searches, secondSearch],
    };
    const { container } = render(<ProfileOnboarding snapshot={snapshot} />);

    expect(container.querySelector('input[name="searchId"]')).toHaveValue(
      fictionalSnapshot.searches[0]?.id,
    );
    await user.click(
      screen.getByRole("button", { name: "Edit Second explicit search" }),
    );
    expect(container.querySelector('input[name="searchId"]')).toHaveValue(
      secondSearch.id,
    );
    expect(screen.getByLabelText("Search name")).toHaveValue(
      "Second explicit search",
    );
  });

  it("resets a pruned selected search and every controlled field from the refreshed snapshot", async () => {
    const user = userEvent.setup();
    const retainedSearch = fictionalSnapshot.searches[0]!;
    const prunedSearch = {
      ...retainedSearch,
      id: "63000000-0000-4000-8000-000000000004",
      name: "Pruned evidence search",
      includeTerms: ["private stale term"],
      ukLocations: ["Private stale location"],
    };
    const snapshot: ProfileSnapshot = {
      ...fictionalSnapshot,
      dataMode: "supabase",
      uploadCapability: emptySnapshot.uploadCapability,
      searches: [retainedSearch, prunedSearch],
    };
    const { container, rerender } = render(
      <ProfileOnboarding snapshot={snapshot} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Pruned evidence search" }),
    );
    expect(container.querySelector('input[name="searchId"]')).toHaveValue(
      prunedSearch.id,
    );

    rerender(
      <ProfileOnboarding
        snapshot={{ ...snapshot, searches: [retainedSearch] }}
      />,
    );

    expect(container.querySelector('input[name="searchId"]')).toHaveValue(
      retainedSearch.id,
    );
    expect(screen.getByLabelText("Search name")).toHaveValue(
      retainedSearch.name,
    );
    expect(screen.getByLabelText("Include terms")).toHaveValue(
      retainedSearch.includeTerms.join(", "),
    );
    expect(screen.getByLabelText("UK locations")).toHaveValue(
      retainedSearch.ukLocations.join(", "),
    );
    expect(
      (container.querySelector('input[name="search"]') as HTMLInputElement)
        .value,
    ).not.toContain("private stale");
  });

  it("preserves every search-specific filter when editing an existing search", async () => {
    const user = userEvent.setup();
    const custom = {
      ...fictionalSnapshot.searches[0]!,
      id: "63000000-0000-4000-8000-000000000003",
      name: "Custom retained search",
      enabled: false,
      roleFamilies: [{ normalizedConcept: "product", label: "Product" }],
      includeTerms: ["retained"],
      excludeTerms: ["agency"],
      industries: [{ normalizedConcept: "health", label: "Health" }],
      domains: [{ normalizedConcept: "privacy", label: "Privacy" }],
      skillConcepts: ["sql"],
      responsibilityConcepts: ["delivery"],
      currentSeniority: "mid" as const,
      targetSeniority: "principal" as const,
      employmentTypes: ["contract" as const],
      workingTimes: ["part_time" as const],
      workplaceTypes: ["remote" as const],
      ukLocations: ["Edinburgh"],
      ir35Statuses: ["outside" as const],
      compensation: {
        minimum: 500,
        maximum: 700,
        period: "day" as const,
        allowUnknown: false,
      },
      recencyDays: 7 as const,
      notificationsEnabled: true,
    };
    const { container } = render(
      <ProfileOnboarding
        snapshot={{
          ...fictionalSnapshot,
          dataMode: "supabase",
          uploadCapability: emptySnapshot.uploadCapability,
          searches: [...fictionalSnapshot.searches, custom],
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Custom retained search" }),
    );
    const saved = JSON.parse(
      (container.querySelector('input[name="search"]') as HTMLInputElement)
        .value,
    );
    const { id: _id, ...expected } = custom;
    expect(_id).toBe(custom.id);
    expect(saved).toEqual(expected);
  });

  it("keeps a newly created search selected so the next save updates its returned ID", async () => {
    const user = userEvent.setup();
    const createdId = "63000000-0000-4000-8000-000000000099";
    actionMocks.saveSearchProfileAction.mockResolvedValue({
      kind: "success",
      message: "Named search saved.",
      resourceId: createdId,
    });
    const { container } = render(
      <ProfileOnboarding
        snapshot={{
          ...fictionalSnapshot,
          dataMode: "supabase",
          uploadCapability: emptySnapshot.uploadCapability,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New search" }));
    await user.click(screen.getByRole("button", { name: "Save named search" }));
    await waitFor(() =>
      expect(container.querySelector('input[name="searchId"]')).toHaveValue(
        createdId,
      ),
    );

    actionMocks.saveSearchProfileAction.mockClear();
    await user.click(screen.getByRole("button", { name: "Save named search" }));
    await waitFor(() =>
      expect(actionMocks.saveSearchProfileAction).toHaveBeenCalledOnce(),
    );
    const submitted = actionMocks.saveSearchProfileAction.mock.calls[0]?.[1];
    expect(submitted).toBeInstanceOf(FormData);
    expect((submitted as FormData).get("searchId")).toBe(createdId);
  });

  it("acknowledges an optimistic search before resetting it when a later refresh prunes it", async () => {
    const user = userEvent.setup();
    const retainedSearch = fictionalSnapshot.searches[0]!;
    const createdId = "63000000-0000-4000-8000-000000000098";
    const createdSearch = {
      ...retainedSearch,
      id: createdId,
      name: "Created then pruned",
      includeTerms: ["stale optimistic term"],
      ukLocations: ["Stale optimistic location"],
    };
    const snapshot: ProfileSnapshot = {
      ...fictionalSnapshot,
      dataMode: "supabase",
      uploadCapability: emptySnapshot.uploadCapability,
      searches: [retainedSearch],
    };
    actionMocks.saveSearchProfileAction.mockResolvedValueOnce({
      kind: "success",
      message: "Named search saved.",
      resourceId: createdId,
    });
    const { container, rerender } = render(
      <ProfileOnboarding snapshot={snapshot} />,
    );

    await user.click(screen.getByRole("button", { name: "New search" }));
    await user.clear(screen.getByLabelText("Search name"));
    await user.type(screen.getByLabelText("Search name"), createdSearch.name);
    await user.clear(screen.getByLabelText("Include terms"));
    await user.type(
      screen.getByLabelText("Include terms"),
      createdSearch.includeTerms[0]!,
    );
    await user.type(
      screen.getByLabelText("UK locations"),
      createdSearch.ukLocations[0]!,
    );
    await user.click(screen.getByRole("button", { name: "Save named search" }));
    await waitFor(() =>
      expect(container.querySelector('input[name="searchId"]')).toHaveValue(
        createdId,
      ),
    );

    rerender(
      <ProfileOnboarding
        snapshot={{ ...snapshot, searches: [retainedSearch, createdSearch] }}
      />,
    );
    expect(container.querySelector('input[name="searchId"]')).toHaveValue(
      createdId,
    );

    rerender(<ProfileOnboarding snapshot={snapshot} />);

    expect(container.querySelector('input[name="searchId"]')).toHaveValue(
      retainedSearch.id,
    );
    expect(screen.getByLabelText("Search name")).toHaveValue(
      retainedSearch.name,
    );
    expect(screen.getByLabelText("Include terms")).toHaveValue(
      retainedSearch.includeTerms.join(", "),
    );
    expect(screen.getByLabelText("UK locations")).toHaveValue(
      retainedSearch.ukLocations.join(", "),
    );

    actionMocks.saveSearchProfileAction.mockClear().mockResolvedValueOnce({
      kind: "success",
      message: "Named search saved.",
    });
    await user.click(screen.getByRole("button", { name: "Save named search" }));
    await waitFor(() =>
      expect(actionMocks.saveSearchProfileAction).toHaveBeenCalledOnce(),
    );
    const submitted = actionMocks.saveSearchProfileAction.mock.calls[0]?.[1];
    expect(submitted).toBeInstanceOf(FormData);
    expect((submitted as FormData).get("searchId")).toBe(retainedSearch.id);
    expect((submitted as FormData).get("search")).not.toContain(
      "stale optimistic",
    );
  });

  it("interlocks profile deletion while a save is queued", async () => {
    const user = userEvent.setup();
    const save = deferred<{ kind: "success"; message: string }>();
    actionMocks.saveProfileDraftAction.mockReturnValueOnce(save.promise);
    render(
      <ProfileOnboarding
        snapshot={{
          ...fictionalSnapshot,
          dataMode: "supabase",
          uploadCapability: emptySnapshot.uploadCapability,
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Save career direction" }),
    );
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete full profile" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save named search" }),
    ).toBeDisabled();
    expect(actionMocks.deleteProfileDataAction).not.toHaveBeenCalled();

    save.resolve({ kind: "success", message: "Career direction saved." });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save career direction" }),
      ).toBeEnabled(),
    );
  });

  it("interlocks every save while profile deletion is queued", async () => {
    const user = userEvent.setup();
    const deletion = deferred<{ kind: "success"; message: string }>();
    actionMocks.deleteProfileDataAction.mockReturnValueOnce(deletion.promise);
    render(
      <ProfileOnboarding
        snapshot={{
          ...fictionalSnapshot,
          dataMode: "supabase",
          uploadCapability: emptySnapshot.uploadCapability,
        }}
      />,
    );
    const profileSave = screen.getByRole("button", {
      name: "Save career direction",
    });
    const searchSave = screen.getByRole("button", {
      name: "Save named search",
    });

    await user.click(
      screen.getByRole("button", { name: "Delete full profile" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete full profile" }),
    );
    await waitFor(() => expect(profileSave).toBeDisabled());
    expect(searchSave).toBeDisabled();
    expect(actionMocks.saveProfileDraftAction).not.toHaveBeenCalled();
    expect(actionMocks.saveSearchProfileAction).not.toHaveBeenCalled();

    deletion.resolve({
      kind: "success",
      message: "Career profile data deleted.",
    });
    await waitFor(() =>
      expect(actionMocks.deleteProfileDataAction).toHaveBeenCalledOnce(),
    );
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

  it("carries the per-search notification choice into the saved draft", async () => {
    const user = userEvent.setup();
    render(
      <ProfileOnboarding
        snapshot={{
          ...fictionalSnapshot,
          dataMode: "supabase",
          uploadCapability: emptySnapshot.uploadCapability,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New search" }));
    const control = screen.getByRole("checkbox", {
      name: /Email me this search’s new matches/,
    });
    expect(control).not.toBeChecked();

    await user.click(control);
    await user.click(screen.getByRole("button", { name: "Save named search" }));

    await waitFor(() =>
      expect(actionMocks.saveSearchProfileAction).toHaveBeenCalled(),
    );
    const submitted = actionMocks.saveSearchProfileAction.mock
      .calls[0]?.[1] as FormData;
    expect(
      JSON.parse(String(submitted.get("search"))).notificationsEnabled,
    ).toBe(true);
  });

  it("reports each saved search's real notification state", () => {
    const [first] = fictionalSnapshot.searches;
    render(
      <ProfileOnboarding
        snapshot={{
          ...fictionalSnapshot,
          dataMode: "supabase",
          uploadCapability: emptySnapshot.uploadCapability,
          searches: [
            { ...first!, id: first!.id, notificationsEnabled: true },
            {
              ...first!,
              id: "63000000-0000-4000-8000-000000000077",
              name: "Quiet search",
              notificationsEnabled: false,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/notifications on/)).toBeInTheDocument();
    expect(screen.getByText(/notifications off/)).toBeInTheDocument();
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
    expect(
      screen.getAllByRole("link", { name: "Search jobs" }),
    ).not.toHaveLength(0);
  });
});

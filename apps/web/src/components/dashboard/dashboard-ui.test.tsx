import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/auth/sign-in/actions", () => ({ signOut: vi.fn() }));

import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { createDevelopmentDashboardRepository } from "@/lib/dashboard/development-dashboard";
import type { DashboardResult } from "@/lib/dashboard/types";

const fictional = await createDevelopmentDashboardRepository().getDashboard(7);

function result(overrides: Partial<DashboardResult> = {}): DashboardResult {
  return { ...fictional, dataMode: "supabase", ...overrides };
}

/** An account that finished onboarding and has done nothing else yet. */
function brandNew(overrides: Partial<DashboardResult> = {}): DashboardResult {
  return result({
    applications: {
      ...fictional.applications,
      insights: {
        ...fictional.applications.insights,
        totalTracked: 0,
        funnel: fictional.applications.insights.funnel.map((step) => ({
          ...step,
          reached: 0,
        })),
        outcomes: {
          open: 0,
          observed: 0,
          quietFourteenPlusDays: 0,
        },
        followUps: { overdue: 0, dueToday: 0, upcoming: 0 },
      },
    },
    decisions: {
      ...fictional.decisions,
      counts: { saved: 0, considering: 0, dismissed: 0 },
      inPeriod: 0,
    },
    ...overrides,
  });
}

describe("DashboardView", () => {
  it("has no detectable accessibility violations", async () => {
    const { container } = render(<DashboardView result={result()} />);

    await expect(axe(container)).resolves.toHaveNoViolations();
  });

  describe("a brand new account", () => {
    it("has no detectable accessibility violations", async () => {
      const { container } = render(<DashboardView result={brandNew()} />);

      await expect(axe(container)).resolves.toHaveNoViolations();
    });

    it("leads with the matches it already found rather than a grid of zeros", () => {
      render(
        <DashboardView
          result={brandNew({
            targetFeed: { ...fictional.targetFeed, currentMatchCount: 5 },
          })}
        />,
      );

      expect(
        screen.getByText(/5 roles match your profile right now/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "View your matches" }),
      ).toHaveAttribute("href", "/matches");
      expect(screen.queryByText("still open")).not.toBeInTheDocument();
    });

    it("says what fills the page instead of drawing empty charts", () => {
      render(<DashboardView result={brandNew()} />);

      expect(screen.getByText("What fills this page")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Track an application/ }),
      ).toHaveAttribute("href", "/jobs");
    });

    it("does not promise matches it has not found", () => {
      render(
        <DashboardView
          result={brandNew({
            targetFeed: { ...fictional.targetFeed, currentMatchCount: 0 },
          })}
        />,
      );

      expect(
        screen.getByText("No roles match your profile yet"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "View your matches" }),
      ).not.toBeInTheDocument();
    });

    it("still shows profile health, which onboarding has already filled in", () => {
      render(<DashboardView result={brandNew()} />);

      expect(screen.getByText("Profile health")).toBeInTheDocument();
    });

    it("drops the window switcher, since nothing is being measured yet", () => {
      render(<DashboardView result={brandNew()} />);

      expect(
        screen.queryByRole("navigation", { name: "Activity window" }),
      ).not.toBeInTheDocument();
    });
  });

  it("explains an empty panel on an account that is otherwise active", () => {
    // Tracked an application but made no decisions: the full dashboard renders,
    // and only the panel with nothing in it explains itself.
    render(
      <DashboardView
        result={result({
          decisions: {
            ...fictional.decisions,
            counts: { saved: 0, considering: 0, dismissed: 0 },
            inPeriod: 0,
          },
        })}
      />,
    );

    expect(
      screen.getByText(/teaches JobWarden your taste/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Activity window" }),
    ).toBeInTheDocument();
  });

  it("states that nothing is estimated", () => {
    render(<DashboardView result={result()} />);

    expect(
      screen.getByText(/Nothing is estimated, and silence from an employer/),
    ).toBeInTheDocument();
  });

  it("labels unanswered applications as observed silence, never rejection", () => {
    render(<DashboardView result={result()} />);

    expect(
      screen.getByText("no response observed in 14+ days"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/implied rejection/i)).not.toBeInTheDocument();
  });

  it("says when there is not enough history to compare", () => {
    render(
      <DashboardView
        result={result({
          applications: {
            ...fictional.applications,
            startedThisPeriod: {
              current: 3,
              previous: 0,
              direction: "no_baseline",
              change: 3,
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText(/not enough history to compare/),
    ).toBeInTheDocument();
  });

  it("describes a rise against the previous period in plain words", () => {
    render(
      <DashboardView
        result={result({
          applications: {
            ...fictional.applications,
            startedThisPeriod: {
              current: 5,
              previous: 2,
              direction: "up",
              change: 3,
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText(/3 more than the period before/),
    ).toBeInTheDocument();
  });

  it("says the trend is by first-seen date rather than implying discovery tracking", () => {
    render(<DashboardView result={result()} />);

    expect(
      screen.getByText("By the day JobWarden first saw each job"),
    ).toBeInTheDocument();
  });

  it("renders every activity chart as a labelled image", () => {
    // Recharts was approved by the owner on 2026-07-20 to match the reference
    // dashboards; the figure carries the name, the drawing inside is hidden.
    render(<DashboardView result={result()} />);

    const charts = screen.getAllByRole("img");
    expect(charts.length).toBeGreaterThan(0);
    for (const chart of charts) {
      expect(chart).toHaveAccessibleName();
    }
  });

  it("reports no single leading profile rather than inventing one", () => {
    render(
      <DashboardView
        result={result({
          targetFeed: { ...fictional.targetFeed, topProfileName: null },
        })}
      />,
    );

    expect(screen.getByText("No single leader")).toBeInTheDocument();
  });

  it("explains the disabled explore state instead of showing zeroes", () => {
    render(
      <DashboardView
        result={result({
          explore: {
            enabled: false,
            qualifyingCount: 0,
            dismissedCount: 0,
            promotedCount: 0,
          },
        })}
      />,
    );

    expect(screen.getByText(/Pathways is off/)).toBeInTheDocument();
    expect(screen.queryByText("pathways qualifying")).not.toBeInTheDocument();
  });

  it("links every section to the surface that can act on it", () => {
    render(<DashboardView result={result()} />);

    for (const [name, href] of [
      ["Open tracker", "/applications"],
      ["Open matches", "/matches"],
      ["Open pathways", "/pathways"],
      ["Open career profile", "/profile"],
    ] as const) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("adds no button or form, because the dashboard is read-only", () => {
    const { container } = render(<DashboardView result={result()} />);

    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("shows profile nudges as suggestions rather than a score", () => {
    render(
      <DashboardView
        result={result({
          profileHealth: {
            confirmedEvidenceCount: 0,
            enabledSearchCount: 0,
            hasCv: false,
            cvKind: null,
            nudges: ["add_cv", "confirm_evidence", "enable_search"],
          },
        })}
      />,
    );

    expect(
      screen.getByText(/Add a CV so matching can use/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it("marks the preview honestly", () => {
    render(<DashboardView result={result({ dataMode: "fixtures" })} />);

    expect(screen.getByText(/frozen fictional statistics/)).toBeInTheDocument();
  });

  it("adds Home to desktop and mobile navigation", () => {
    render(
      <AppShell dataMode="fixtures" activePath="home">
        <p>Content</p>
      </AppShell>,
    );

    const links = screen.getAllByRole("link", { name: "Home" });
    expect(links).not.toHaveLength(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/home");
  });

  it("marks Home as the current page when it is active", () => {
    render(
      <AppShell dataMode="fixtures" activePath="home">
        <p>Content</p>
      </AppShell>,
    );

    const nav = screen.getAllByRole("navigation", { name: "Primary" })[0]!;
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

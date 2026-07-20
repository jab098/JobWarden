import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import DevelopmentAdminPreview from "./page";

describe("development administrator preview", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("fails closed unless the exact local development bypass is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "false");

    await expect(DevelopmentAdminPreview()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("renders fictional read-only operations without live forms", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JOBWARDEN_DEV_ACCESS_BYPASS", "true");

    const { container } = render(await DevelopmentAdminPreview());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Admin",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fictional Rowan")).toBeInTheDocument();
    expect(
      screen.getAllByText("Fictional Northstar UK Ltd").length,
    ).toBeGreaterThan(0);
    // The preview must say what it is. The wording moved from a banner in the
    // old admin shell into the section's own description when administration
    // became a hub section rather than a separate shell.
    expect(
      screen.getByText(/grants no administrator access/i),
    ).toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});

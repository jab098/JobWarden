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
        name: "Administrator operations preview",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fictional Rowan")).toBeInTheDocument();
    expect(
      screen.getAllByText("Fictional Northstar UK Ltd").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Read-only fictional administrator preview — no administrator access granted",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});

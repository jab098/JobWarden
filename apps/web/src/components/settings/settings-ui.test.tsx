import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  deleteCvAction: vi.fn(async () => ({
    kind: "success" as const,
    message: "CV data deleted.",
  })),
  deleteProfileDataAction: vi.fn(async () => ({
    kind: "success" as const,
    message: "Career profile data deleted.",
  })),
}));

vi.mock("@/app/(protected)/profile/actions", () => actionMocks);

import { PrivacyControls } from "@/components/settings/privacy-controls";

describe("PrivacyControls on the settings surface", () => {
  it("deletes nothing without an explicit dialog confirmation", async () => {
    const user = userEvent.setup();
    render(<PrivacyControls readOnly={false} hasCv blocked={false} />);

    await user.click(
      screen.getByRole("button", { name: "Delete full profile" }),
    );
    // The trigger only opened the dialog; the destructive action has not run.
    expect(actionMocks.deleteProfileDataAction).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(actionMocks.deleteProfileDataAction).not.toHaveBeenCalled();
  });

  it("runs the deletion only from the dialog's own confirm control", async () => {
    const user = userEvent.setup();
    render(<PrivacyControls readOnly={false} hasCv blocked={false} />);

    await user.click(
      screen.getByRole("button", { name: "Delete full profile" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete full profile",
    );
    expect(confirm).toBeDefined();
    await user.click(confirm!);
    await waitFor(() =>
      expect(actionMocks.deleteProfileDataAction).toHaveBeenCalledOnce(),
    );
  });

  it("disables CV deletion when there is no CV, and everything in the preview", () => {
    const { rerender } = render(
      <PrivacyControls readOnly={false} hasCv={false} blocked={false} />,
    );
    expect(
      screen.getByRole("button", { name: /Delete CV data/ }),
    ).toBeDisabled();

    rerender(<PrivacyControls readOnly hasCv blocked={false} />);
    expect(
      screen.getByRole("button", { name: /Delete CV data/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete full profile" }),
    ).toBeDisabled();
  });
});

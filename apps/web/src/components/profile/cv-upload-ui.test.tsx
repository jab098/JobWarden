import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const uploadCv = vi.fn();
vi.mock("@/lib/profile/cv-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/profile/cv-upload")>()),
  uploadCv: (...args: unknown[]) => uploadCv(...args),
}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

import { CvUploadCard } from "@/components/profile/cv-upload-card";

const userId = "11111111-1111-4111-8111-111111111111";

function docx(name = "cv.docx") {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

beforeEach(() => {
  refresh.mockReset();
  uploadCv.mockReset().mockResolvedValue({
    kind: "uploaded",
    documentId: "d",
    extractionStarted: true,
  });
  getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: userId } }, error: null });
});

describe("CV upload card", () => {
  it("explains why uploading is closed and offers no control", () => {
    render(
      <CvUploadCard
        capability={{ enabled: false, reason: "uploads_disabled" }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    expect(
      screen.getByText(
        "CV uploads are not open yet. An administrator opens them for the whole application.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a CV file")).not.toBeInTheDocument();
  });

  it("keeps the upload button inert until a file is actually chosen", async () => {
    const user = userEvent.setup();
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    await user.upload(screen.getByLabelText("Choose a CV file"), docx());
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  });

  it("uploads the chosen file against the current generation and re-reads the profile", async () => {
    const user = userEvent.setup();
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    await user.upload(screen.getByLabelText("Choose a CV file"), docx());
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploadCv).toHaveBeenCalledTimes(1));
    expect(uploadCv.mock.calls[0]?.[1]).toMatchObject({
      userId,
      generation: 4,
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          "CV uploaded. We are reading it now; this usually takes under a minute.",
        ),
      ).toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  // The state that had no copy at all until 2026-07-21. Every browser upload
  // hit it — the extraction request failed a missing CORS preflight — and the
  // card said the CV was being read regardless, so the file sat unprocessed
  // with nothing on screen to say so.
  it("says so when the upload succeeded but extraction did not start", async () => {
    const user = userEvent.setup();
    uploadCv.mockResolvedValue({
      kind: "uploaded",
      documentId: "d",
      extractionStarted: false,
    });
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    await user.upload(screen.getByLabelText("Choose a CV file"), docx());
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(screen.getByText(/processing did not start/i)).toBeInTheDocument(),
    );
    // And it must not claim the file is being read.
    expect(screen.queryByText(/We are reading it now/i)).toBeNull();
  });

  it("reports a rejected file as an alert and does not re-read the profile", async () => {
    const user = userEvent.setup();
    uploadCv.mockResolvedValue({ kind: "rejected", reason: "too_large" });
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    await user.upload(screen.getByLabelText("Choose a CV file"), docx());
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That file is over 5 MB.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not attempt an upload when there is no session to upload under", async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    await user.upload(screen.getByLabelText("Choose a CV file"), docx());
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "CV uploads are not open on this account.",
      ),
    );
    expect(uploadCv).not.toHaveBeenCalled();
  });

  it("keeps the user's file name out of the message it renders back", async () => {
    const user = userEvent.setup();
    uploadCv.mockResolvedValue({ kind: "failed" });
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv={false}
      />,
    );

    await user.upload(
      screen.getByLabelText("Choose a CV file"),
      docx("Jane Doe CV.docx"),
    );
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).not.toContain("Jane");
  });

  it("says it is replacing rather than adding when a CV already exists", () => {
    render(
      <CvUploadCard
        capability={{ enabled: true }}
        generation={4}
        hasCurrentCv
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Replace your CV" }),
    ).toBeInTheDocument();
  });
});

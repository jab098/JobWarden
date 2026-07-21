"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  uploadCv,
  type CvUploadClient,
  type CvUploadOutcome,
  type CvUploadRejection,
} from "@/lib/profile/cv-upload";
import type { ProfileUploadCapability } from "@/lib/profile/types";

const closedCopy: Record<
  Extract<ProfileUploadCapability, { enabled: false }>["reason"],
  string
> = {
  fictional_preview:
    "This preview runs on fictional data, so uploading is switched off here.",
  uploads_disabled:
    "CV uploads are not open yet. An administrator opens them for the whole application.",
};

const rejectionCopy: Record<CvUploadRejection, string> = {
  unsupported_type:
    "JobWarden reads DOCX and PDF files. Convert yours and try again.",
  empty_file: "That file is empty.",
  too_large: "That file is over 5 MB. Export it again at a smaller size.",
  content_mismatch:
    "That file's contents do not match its extension. Re-export it from your editor and try again.",
};

const resultCopy: Record<
  Exclude<CvUploadOutcome["kind"], "rejected">,
  string
> = {
  uploaded:
    "CV uploaded. We are reading it now; this usually takes under a minute.",
  stale:
    "Your profile changed while this was uploading. Refresh and try again.",
  forbidden: "CV uploads are not open on this account.",
  failed: "The upload did not finish. Try again.",
};

/**
 * The upload succeeded but nothing is reading the file. Saying so is the whole
 * point: the previous copy claimed the CV was being read whatever happened, so
 * a failed extraction request looked identical to a working one and simply
 * never finished.
 */
const extractionNotStartedCopy =
  "CV uploaded, but processing did not start. Your file is saved — try again, and tell your administrator if it keeps happening.";

function messageFor(outcome: CvUploadOutcome): string {
  if (outcome.kind === "uploaded" && !outcome.extractionStarted) {
    return extractionNotStartedCopy;
  }
  return outcome.kind === "rejected"
    ? rejectionCopy[outcome.reason]
    : resultCopy[outcome.kind];
}

function heading(hasCurrentCv: boolean): string {
  return hasCurrentCv ? "Replace your CV" : "Add your CV";
}

/**
 * The closed and open cards are separate components rather than one component
 * with an early return, because the open one needs the router and the closed
 * one must render anywhere — including the fictional preview and every test
 * that has no app router mounted.
 */
export function CvUploadCard({
  capability,
  generation,
  hasCurrentCv,
}: {
  capability: ProfileUploadCapability;
  generation: number;
  hasCurrentCv: boolean;
}) {
  if (!capability.enabled) {
    return (
      <div className="rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {heading(hasCurrentCv)}
        </h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-ink-secondary">
          {closedCopy[capability.reason]}
        </p>
      </div>
    );
  }
  return <CvUploadForm generation={generation} hasCurrentCv={hasCurrentCv} />;
}

function CvUploadForm({
  generation,
  hasCurrentCv,
}: {
  generation: number;
  hasCurrentCv: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(false);
  const [outcome, setOutcome] = useState<CvUploadOutcome | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file || busy) return;

    setBusy(true);
    setOutcome(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setOutcome({ kind: "forbidden" });
        return;
      }
      const result = await uploadCv(supabase as unknown as CvUploadClient, {
        file,
        userId: data.user.id,
        generation,
      });
      setOutcome(result);
      if (result.kind === "uploaded") {
        if (inputRef.current) inputRef.current.value = "";
        // The snapshot owns the CV's lifecycle status, so re-read it rather
        // than mirroring extraction progress in local state.
        router.refresh();
      }
    } catch {
      // Deliberately swallowed: a caught upload error can carry the file name
      // or a storage path, and neither belongs anywhere a log can reach.
      setOutcome({ kind: "failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {heading(hasCurrentCv)}
      </h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-ink-secondary">
        {hasCurrentCv
          ? "Uploading a new CV replaces the current one. Evidence you have already confirmed stays confirmed."
          : "DOCX or PDF, up to 5 MB. It stays private to you and is never shared with employers."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="sr-only">
          Choose a CV file
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          name="cv"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(event) => {
            setChosen((event.target.files?.length ?? 0) > 0);
            setOutcome(null);
          }}
          className="max-w-full text-sm text-ink-secondary file:mr-3 file:rounded-md file:border file:border-[#d9d4c9] file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-surface-sunken"
        />
        <Button type="submit" size="sm" disabled={busy || !chosen}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {outcome ? (
        <p
          role={outcome.kind === "uploaded" ? "status" : "alert"}
          className={`mt-3 text-sm ${
            outcome.kind === "uploaded" ? "text-success" : "text-[#8a2b2b]"
          }`}
        >
          {messageFor(outcome)}
        </p>
      ) : null}
    </form>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import {
  buildTailoringReview,
  type TailoringOperation,
} from "@jobwarden/domain";
import {
  deleteVariantAction,
  promoteVariantAction,
  saveVariantAction,
} from "@/app/(protected)/tailor/[jobId]/actions";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  TailoringActionState,
  TailoringWorkspace,
} from "@/lib/tailoring/types";

const initialState: TailoringActionState = { kind: "idle" };

const rejectionLabels: Record<string, (detail: string) => string> = {
  introduced_number: (detail) =>
    `“${detail}” does not appear in your CV. JobWarden will not add a figure you have not already claimed.`,
  unsupported_term: (detail) =>
    `“${detail}” appears in neither your CV nor this advert, so it cannot be supported.`,
  excessive_expansion: (detail) =>
    `This is much longer than the original paragraph (limit ${detail} characters). Tailoring sharpens what is there; it does not add new claims.`,
  empty_replacement: () => "Replacement text cannot be empty.",
  unknown_paragraph: () => "That paragraph is not part of this document.",
  duplicate_paragraph: () => "That paragraph already has a change.",
};

type Draft = {
  omitted: boolean;
  text: string;
};

function initialDrafts(workspace: TailoringWorkspace): Map<number, Draft> {
  const drafts = new Map<number, Draft>();
  for (const paragraph of workspace.paragraphs) {
    drafts.set(paragraph.index, { omitted: false, text: paragraph.text });
  }
  for (const operation of workspace.variant?.operations ?? []) {
    const existing = drafts.get(operation.paragraphIndex);
    if (existing === undefined) continue;
    drafts.set(operation.paragraphIndex, {
      omitted: operation.kind === "omit",
      text: operation.kind === "replace" ? operation.text : existing.text,
    });
  }
  return drafts;
}

export function TailoringWorkspaceView({
  workspace,
}: {
  workspace: TailoringWorkspace;
}) {
  const [drafts, setDrafts] = useState(() => initialDrafts(workspace));
  const [name, setName] = useState(
    workspace.variant?.name ?? `Tailored for ${workspace.job.employer}`,
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveVariantAction,
    initialState,
  );
  const [promoteState, promoteAction, promotePending] = useActionState(
    promoteVariantAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteVariantAction,
    initialState,
  );

  const readOnly = workspace.dataMode === "fixtures";

  const operations = useMemo<TailoringOperation[]>(() => {
    const result: TailoringOperation[] = [];
    for (const paragraph of workspace.paragraphs) {
      const draft = drafts.get(paragraph.index);
      if (draft === undefined) continue;
      if (draft.omitted) {
        result.push({ paragraphIndex: paragraph.index, kind: "omit" });
      } else if (draft.text.trim() !== paragraph.text.trim()) {
        result.push({
          paragraphIndex: paragraph.index,
          kind: "replace",
          text: draft.text,
        });
      }
    }
    return result;
  }, [drafts, workspace.paragraphs]);

  const review = useMemo(
    () =>
      buildTailoringReview({
        paragraphs: workspace.paragraphs,
        operations,
        cvText: workspace.cvText,
        jobText: workspace.jobText,
      }),
    [operations, workspace],
  );

  const verdictByIndex = useMemo(
    () =>
      new Map(review.changes.map((change) => [change.paragraphIndex, change])),
    [review],
  );

  function update(index: number, next: Partial<Draft>): void {
    setDrafts((current) => {
      const updated = new Map(current);
      const existing = updated.get(index);
      if (existing) updated.set(index, { ...existing, ...next });
      return updated;
    });
  }

  if (!workspace.source.available) {
    return (
      <section className="px-5 py-10 lg:px-8">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          A DOCX CV is required
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-6 text-ink-secondary">
          {workspace.source.reason === "pdf_only"
            ? "Your current CV is a PDF. JobWarden can read a PDF to build your profile, but producing a tailored copy that keeps your original layout needs an editable DOCX. Upload a DOCX version to tailor it for this role."
            : "Add a DOCX CV to your career profile before tailoring it for a role. A DOCX is what lets JobWarden return a copy with your own layout intact."}
        </p>
        <p className="mt-5">
          <Link
            href="/profile"
            className="text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Go to your career profile
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="px-5 py-8 lg:px-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
        {workspace.job.title}
      </h1>
      <p className="mt-1 text-sm text-ink-secondary">
        {workspace.job.employer}
      </p>
      <p className="mt-3 max-w-prose text-sm leading-6 text-ink-secondary">
        Sharpen your own words for this role. JobWarden checks every change
        against your CV and this advert: it will not let you add a figure your
        CV does not contain, or a tool, employer, or qualification that appears
        in neither document. Your original file is never modified.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.5fr)]">
        <div className="min-w-0">
          <ol className="divide-y divide-border border-y border-border">
            {workspace.paragraphs.map((paragraph) => {
              const draft = drafts.get(paragraph.index)!;
              const verdict = verdictByIndex.get(paragraph.index);
              const relevant = workspace.focus.relevant.includes(
                paragraph.index,
              );
              const omissionCandidate =
                workspace.focus.omissionCandidates.includes(paragraph.index);

              return (
                <li key={paragraph.index} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-faint">
                      Paragraph {paragraph.index + 1}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {relevant ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="mr-2 inline-block size-2 rounded-full bg-success align-middle"
                          />
                          Already speaks to this advert
                        </>
                      ) : omissionCandidate ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="mr-2 inline-block size-2 rounded-full bg-ink-faint align-middle"
                          />
                          Not related to this advert
                        </>
                      ) : null}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-ink-secondary [overflow-wrap:anywhere]">
                    {paragraph.text || "(empty paragraph)"}
                  </p>

                  {paragraph.text === "" ? null : (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={draft.omitted}
                          disabled={readOnly}
                          onChange={(event) =>
                            update(paragraph.index, {
                              omitted: event.target.checked,
                            })
                          }
                          className="size-4 accent-(--link)"
                        />
                        Leave this paragraph out
                      </label>

                      {draft.omitted ? null : (
                        <>
                          <Label
                            htmlFor={`paragraph-${paragraph.index}`}
                            className="sr-only"
                          >
                            Replacement wording for paragraph{" "}
                            {paragraph.index + 1}
                          </Label>
                          <Textarea
                            id={`paragraph-${paragraph.index}`}
                            value={draft.text}
                            rows={2}
                            maxLength={4000}
                            disabled={readOnly}
                            onChange={(event) =>
                              update(paragraph.index, {
                                text: event.target.value,
                              })
                            }
                          />
                        </>
                      )}

                      {verdict && !verdict.accepted ? (
                        <ul role="alert" className="space-y-1">
                          {verdict.reasons.map((reason) => (
                            <li
                              key={`${reason.code}:${reason.detail}`}
                              className="text-xs text-danger"
                            >
                              {(
                                rejectionLabels[reason.code] ??
                                (() => "This change is not supported.")
                              )(reason.detail)}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {verdict?.warnings.includes("mixed_formatting") ? (
                        <p className="text-xs text-warning">
                          This paragraph mixes bold or italic runs. A rewrite
                          keeps the first run&rsquo;s formatting for the whole
                          paragraph.
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="min-w-0 lg:border-l lg:border-border lg:pl-6">
          <h2 className="text-sm font-semibold text-foreground">
            Change summary
          </h2>
          {review.changes.length === 0 ? (
            <p className="mt-2 text-sm text-ink-secondary">
              No changes yet. Edit a paragraph or mark one to leave out.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-ink-secondary">
              {review.changes.map((change) => (
                <li
                  key={change.paragraphIndex}
                  className="[overflow-wrap:anywhere]"
                >
                  <span
                    aria-hidden="true"
                    className={`mr-2 inline-block size-2 rounded-full align-middle ${
                      change.accepted ? "bg-success" : "bg-danger"
                    }`}
                  />
                  Paragraph {change.paragraphIndex + 1}:{" "}
                  {change.kind === "omit" ? "left out" : "reworded"}
                  {change.accepted ? "" : ": not supported"}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-faint">
            {review.acceptedCount} accepted · {review.rejectedCount} blocked
          </p>

          <form action={saveAction} className="mt-5 space-y-3">
            <input type="hidden" name="jobId" value={workspace.job.id} />
            <input
              type="hidden"
              name="operations"
              value={JSON.stringify(operations)}
            />
            <div className="space-y-2">
              <Label htmlFor="variant-name">Variant name</Label>
              <Input
                id="variant-name"
                name="name"
                value={name}
                maxLength={120}
                disabled={readOnly}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={
                readOnly ||
                savePending ||
                review.rejectedCount > 0 ||
                review.acceptedCount === 0
              }
            >
              {savePending ? "Saving…" : "Save draft"}
            </Button>
            <ActionFeedback state={saveState} />
          </form>

          {workspace.variant ? (
            <div className="mt-6 space-y-3 border-t border-border pt-5">
              <h2 className="text-sm font-semibold text-foreground">
                {workspace.variant.name}
              </h2>
              <p className="text-xs text-ink-faint">
                {workspace.variant.status === "draft"
                  ? "Draft. Deleted automatically 24 hours after it was last saved."
                  : "Saved. Kept until you delete it."}
              </p>
              <p>
                <a
                  href={`/tailor/${workspace.job.id}/download?variantId=${workspace.variant.id}`}
                  className="text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Download tailored DOCX
                </a>
              </p>
              {workspace.variant.status === "draft" ? (
                <form action={promoteAction}>
                  <input
                    type="hidden"
                    name="variantId"
                    value={workspace.variant.id}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={readOnly || promotePending}
                  >
                    Keep this variant
                  </Button>
                  <ActionFeedback state={promoteState} />
                </form>
              ) : null}
              <form action={deleteAction}>
                <input
                  type="hidden"
                  name="variantId"
                  value={workspace.variant.id}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={readOnly || deletePending}
                >
                  Delete variant
                </Button>
                <ActionFeedback state={deleteState} />
              </form>
            </div>
          ) : null}

          {readOnly ? (
            <p className="mt-5 text-sm text-ink-secondary">
              This preview uses a fictional CV and cannot save changes.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

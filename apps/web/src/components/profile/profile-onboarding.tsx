"use client";

import { useActionState, useEffect, useState } from "react";
import { FileLock2, Plus, Trash2, X } from "lucide-react";

import {
  deleteCvAction,
  deleteProfileDataAction,
  saveProfileDraftAction,
} from "@/app/(protected)/profile/actions";
import { ProfileEvidenceList } from "@/components/profile/profile-evidence-list";
import { ProfileSuggestionList } from "@/components/profile/profile-suggestion-list";
import { SearchProfileForm } from "@/components/profile/search-profile-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  seniorityLevels,
  type CareerEvidenceItem,
  type CareerProfileDraft,
} from "@jobwarden/domain";
import type { ProfileActionState, ProfileSnapshot } from "@/lib/profile/types";

const initialState: ProfileActionState = { kind: "idle" };

function labelForSeniority(value: string): string {
  if (value === "unspecified") return "Not specified";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function concepts(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].map((label) => ({
    normalizedConcept: label.toLocaleLowerCase("en-GB"),
    label,
  }));
}

async function deleteCvFormAction(
  previousState: ProfileActionState,
  formData: FormData,
) {
  void previousState;
  void formData;
  return deleteCvAction();
}

async function deleteProfileFormAction(
  previousState: ProfileActionState,
  formData: FormData,
) {
  void previousState;
  void formData;
  return deleteProfileDataAction();
}

function PrivacyControls({
  readOnly,
  hasCv,
  blocked,
  onPendingChange,
}: {
  readOnly: boolean;
  hasCv: boolean;
  blocked: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const [cvState, cvAction, cvPending] = useActionState(
    deleteCvFormAction,
    initialState,
  );
  const [profileState, profileAction, profilePending] = useActionState(
    deleteProfileFormAction,
    initialState,
  );
  useEffect(
    () => onPendingChange(cvPending || profilePending),
    [cvPending, onPendingChange, profilePending],
  );
  return (
    <section
      aria-labelledby="profile-privacy-heading"
      className="border-t border-[#dedbd2] py-8"
    >
      <h2
        id="profile-privacy-heading"
        className="text-xl font-semibold tracking-[-0.02em]"
      >
        Privacy controls
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#596173]">
        Delete private source documents separately, or remove the full career
        profile and every derived record. These controls never affect your beta
        access.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                disabled={readOnly || !hasCv || cvPending || blocked}
              />
            }
          >
            <Trash2 aria-hidden="true" /> Delete CV data
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete the current CV and extracted evidence?
              </AlertDialogTitle>
              <AlertDialogDescription>
                The private Storage object is removed before its metadata and
                all evidence derived from it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form action={cvAction} onSubmit={() => onPendingChange(true)}>
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={cvPending}
                >
                  Delete CV data
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="destructive"
                disabled={readOnly || profilePending || blocked}
              />
            }
          >
            Delete full profile
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete the full career profile?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes CV objects, evidence, suggestions, and named
                searches. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form
                action={profileAction}
                onSubmit={() => onPendingChange(true)}
              >
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={profilePending}
                >
                  Delete full profile
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {[cvState, profileState].map((state, index) =>
        state.kind !== "idle" ? (
          <p
            key={index}
            role={state.kind === "success" ? "status" : "alert"}
            className="mt-3 text-sm text-[#596173]"
          >
            {state.message}
          </p>
        ) : null,
      )}
    </section>
  );
}

function ProfileOnboardingEditor({ snapshot }: { snapshot: ProfileSnapshot }) {
  const profile = snapshot.draft;
  const readOnly = snapshot.dataMode === "fixtures";
  const [currentSeniority, setCurrentSeniority] = useState(
    profile?.currentSeniority ?? "unspecified",
  );
  const [targetSeniority, setTargetSeniority] = useState(
    profile?.targetSeniority ?? "unspecified",
  );
  const [roles, setRoles] = useState(
    profile?.targetRoleFamilies.map((item) => item.label).join(", ") ?? "",
  );
  const [industries, setIndustries] = useState(
    profile?.industries.map((item) => item.label).join(", ") ?? "",
  );
  const [domains, setDomains] = useState(
    profile?.domains.map((item) => item.label).join(", ") ?? "",
  );
  const [keywords, setKeywords] = useState(profile?.keywords.join(", ") ?? "");
  const [skill, setSkill] = useState("");
  const [userEvidence, setUserEvidence] = useState<CareerEvidenceItem[]>(
    profile?.evidence.filter((item) => item.origin === "user") ?? [],
  );
  const [state, action, pending] = useActionState(
    saveProfileDraftAction,
    initialState,
  );
  const [searchPending, setSearchPending] = useState(false);
  const [privacyPending, setPrivacyPending] = useState(false);
  const cvEvidence =
    profile?.evidence.filter((item) => item.origin === "cv") ?? [];
  const draft = {
    cvDocumentId: profile?.cvDocumentId ?? null,
    currentSeniority,
    targetSeniority,
    evidence: [...cvEvidence, ...userEvidence],
    targetRoleFamilies: concepts(roles),
    industries: concepts(industries),
    domains: concepts(domains),
    keywords: [
      ...new Set(
        keywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ],
  };

  function addSkill() {
    const label = skill.trim();
    if (!label) return;
    const normalizedConcept = label.toLocaleLowerCase("en-GB");
    if (
      [...cvEvidence, ...userEvidence].some(
        (item) => item.normalizedConcept === normalizedConcept,
      )
    ) {
      setSkill("");
      return;
    }
    setUserEvidence((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        normalizedConcept,
        label,
        category: "skill",
        origin: "user",
        confidence: 1,
        evidenceReference: null,
        evidenceExcerpt: null,
        proficiencySignal: "working",
        lastUsedAt: null,
        confirmationState: "confirmed",
      },
    ]);
    setSkill("");
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-white px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="pb-8">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#697181]">
          Private career evidence
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-4xl">
              Career profile
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#596173]">
              Tell JobWarden where you have been and where you want to go. You
              approve every machine suggestion before it can shape a search.
            </p>
          </div>
          {readOnly ? (
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[#7a5a20]">
              Fictional profile preview
            </span>
          ) : null}
        </div>
      </header>

      <section
        aria-labelledby="career-direction-heading"
        className="border-t border-[#dedbd2] py-8"
      >
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
            {profile ? "Your direction" : "Start with what you know"}
          </p>
          <h2
            id="career-direction-heading"
            className="mt-2 text-xl font-semibold tracking-[-0.02em]"
          >
            Career direction
          </h2>
        </div>
        <form action={action} className="mt-6 space-y-6">
          <input
            type="hidden"
            name="profileGeneration"
            value={snapshot.generation}
          />
          <input type="hidden" name="draft" value={JSON.stringify(draft)} />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-seniority">Current seniority</Label>
              <select
                id="current-seniority"
                value={currentSeniority}
                onChange={(event) =>
                  setCurrentSeniority(
                    event.target
                      .value as CareerProfileDraft["currentSeniority"],
                  )
                }
                disabled={readOnly}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                {seniorityLevels.map((item) => (
                  <option key={item} value={item}>
                    {labelForSeniority(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-seniority">Target seniority</Label>
              <select
                id="target-seniority"
                value={targetSeniority}
                onChange={(event) =>
                  setTargetSeniority(
                    event.target.value as CareerProfileDraft["targetSeniority"],
                  )
                }
                disabled={readOnly}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                {seniorityLevels.map((item) => (
                  <option key={item} value={item}>
                    {labelForSeniority(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="target-roles">Target role families</Label>
              <Input
                id="target-roles"
                value={roles}
                onChange={(event) => setRoles(event.target.value)}
                placeholder="Implementation consultant, analytics lead"
                disabled={readOnly}
                className="[overflow-wrap:anywhere]"
              />
              <p className="text-xs text-[#697181]">
                Separate more than one with commas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="industries">Industries</Label>
              <Input
                id="industries"
                value={industries}
                onChange={(event) => setIndustries(event.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domains">Domains</Label>
              <Input
                id="domains"
                value={domains}
                onChange={(event) => setDomains(event.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="measurement strategy, data governance"
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="rounded-md border border-[#e7e3da] p-4">
            <Label htmlFor="add-skill">Add a skill</Label>
            <div className="mt-2 flex max-w-xl gap-2">
              <Input
                id="add-skill"
                value={skill}
                onChange={(event) => setSkill(event.target.value)}
                disabled={readOnly}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addSkill}
                disabled={readOnly || !skill.trim()}
              >
                <Plus aria-hidden="true" /> Add skill
              </Button>
            </div>
            {userEvidence.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {userEvidence.map((item) => (
                  <li
                    key={item.id}
                    className="flex max-w-full items-center gap-1 rounded-sm border border-[#d8d4cb] bg-[#f8f7f3] px-2 py-1 text-sm [overflow-wrap:anywhere]"
                  >
                    <span>{item.label}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${item.label}`}
                      disabled={readOnly}
                      onClick={() =>
                        setUserEvidence((items) =>
                          items.filter((entry) => entry.id !== item.id),
                        )
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={readOnly || pending || searchPending || privacyPending}
            >
              {pending ? "Saving…" : "Save career direction"}
            </Button>
            {state.kind !== "idle" ? (
              <p
                role={state.kind === "success" ? "status" : "alert"}
                className="text-sm text-[#596173]"
              >
                {state.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section
        aria-labelledby="cv-source-heading"
        className="border-t border-[#dedbd2] py-8"
      >
        <div className="flex items-start gap-3">
          <FileLock2
            aria-hidden="true"
            className="mt-0.5 size-5 text-[#2458a6]"
          />
          <div>
            <h2
              id="cv-source-heading"
              className="text-xl font-semibold tracking-[-0.02em]"
            >
              Real CV upload is unavailable
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#596173]">
              Upload remains disabled until live authentication, private
              Storage, deletion, and Docker-backed RLS tests are verified. This
              preview uses fictional evidence and never sends a file.
            </p>
            {snapshot.currentCv ? (
              <p className="mt-3 font-mono text-xs text-[#697181] [overflow-wrap:anywhere]">
                {readOnly ? "Fictional" : "Current private"} source:{" "}
                {snapshot.currentCv.fileName}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <ProfileEvidenceList evidence={draft.evidence} readOnly={readOnly} />
      <ProfileSuggestionList
        suggestions={snapshot.suggestions}
        readOnly={readOnly}
      />
      <SearchProfileForm
        profile={draft}
        searches={snapshot.searches}
        generation={snapshot.generation}
        readOnly={readOnly}
        blocked={pending || privacyPending}
        onPendingChange={setSearchPending}
      />
      <PrivacyControls
        readOnly={readOnly}
        hasCv={snapshot.currentCv !== null}
        blocked={pending || searchPending}
        onPendingChange={setPrivacyPending}
      />
    </div>
  );
}

export function ProfileOnboarding({ snapshot }: { snapshot: ProfileSnapshot }) {
  const snapshotIdentity = snapshot.draft
    ? `profile:${snapshot.generation}:${snapshot.currentCv?.id ?? "without-cv"}`
    : `profile:empty:${snapshot.generation}`;
  return <ProfileOnboardingEditor key={snapshotIdentity} snapshot={snapshot} />;
}

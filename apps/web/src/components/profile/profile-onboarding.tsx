"use client";

import { useActionState, useState } from "react";
import { FileLock2, Plus, X } from "lucide-react";

import { saveProfileDraftAction } from "@/app/(protected)/profile/actions";
import { CvUploadCard } from "@/components/profile/cv-upload-card";
import { ProfileEvidenceList } from "@/components/profile/profile-evidence-list";
import { ProfileSuggestionList } from "@/components/profile/profile-suggestion-list";
import { SearchProfileForm } from "@/components/profile/search-profile-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="mx-auto max-w-5xl px-4 py-5 lg:px-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Career profile
          </h1>
          {readOnly ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-faint">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-warning"
              />
              Fictional profile preview
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
          Tell JobWarden where you have been and where you want to go. You
          approve every machine suggestion before it can shape a search.
        </p>
      </header>

      <section
        aria-labelledby="career-direction-heading"
        className="mt-4 rounded-lg border border-border bg-card p-5"
      >
        <h2
          id="career-direction-heading"
          className="text-base font-semibold tracking-[-0.01em]"
        >
          Career direction
        </h2>
        {profile ? null : (
          <p className="mt-1 text-sm text-ink-faint">
            Start with what you know
          </p>
        )}
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
              <Select
                value={currentSeniority}
                onValueChange={(value) =>
                  setCurrentSeniority(
                    value as CareerProfileDraft["currentSeniority"],
                  )
                }
                items={seniorityLevels.map((item) => ({
                  value: item,
                  label: labelForSeniority(item),
                }))}
              >
                <SelectTrigger
                  id="current-seniority"
                  disabled={readOnly}
                  className="w-full bg-card"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  {seniorityLevels.map((item) => (
                    <SelectItem key={item} value={item}>
                      {labelForSeniority(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-seniority">Target seniority</Label>
              <Select
                value={targetSeniority}
                onValueChange={(value) =>
                  setTargetSeniority(
                    value as CareerProfileDraft["targetSeniority"],
                  )
                }
                items={seniorityLevels.map((item) => ({
                  value: item,
                  label: labelForSeniority(item),
                }))}
              >
                <SelectTrigger
                  id="target-seniority"
                  disabled={readOnly}
                  className="w-full bg-card"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  {seniorityLevels.map((item) => (
                    <SelectItem key={item} value={item}>
                      {labelForSeniority(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <p className="text-xs text-ink-faint">
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
          <div className="rounded-md border border-border p-4">
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
                    className="flex max-w-full items-center gap-1 rounded-sm border border-border bg-surface-sunken px-2 py-1 text-sm [overflow-wrap:anywhere]"
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
              disabled={readOnly || pending || searchPending}
            >
              {pending ? "Saving…" : "Save career direction"}
            </Button>
            {state.kind !== "idle" ? (
              <p
                role={state.kind === "success" ? "status" : "alert"}
                className="text-sm text-ink-secondary"
              >
                {state.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section
        aria-labelledby="cv-source-heading"
        className="mt-3 rounded-lg border border-border bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <FileLock2
            aria-hidden="true"
            strokeWidth={1.75}
            className="mt-0.5 size-4.5 text-ink-faint"
          />
          <div className="min-w-0 flex-1">
            <h2
              id="cv-source-heading"
              className="text-base font-semibold tracking-[-0.01em]"
            >
              Your CV
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
              JobWarden reads your CV to find what it can honestly match you on.
              The file is stored privately, is never shared with employers, and
              you can delete it and everything derived from it at any time.
            </p>
            {snapshot.currentCv ? (
              <p className="mt-3 font-mono text-xs text-ink-faint [overflow-wrap:anywhere]">
                {readOnly ? "Fictional" : "Current private"} source:{" "}
                {snapshot.currentCv.fileName}
                {snapshot.currentCv.lifecycleStatus === "ready"
                  ? null
                  : ` (${snapshot.currentCv.lifecycleStatus})`}
              </p>
            ) : null}
            <div className="mt-4 max-w-2xl">
              <CvUploadCard
                capability={snapshot.uploadCapability}
                generation={snapshot.generation}
                hasCurrentCv={snapshot.currentCv !== null}
              />
            </div>
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
        blocked={pending}
        onPendingChange={setSearchPending}
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

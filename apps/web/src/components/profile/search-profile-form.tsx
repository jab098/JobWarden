"use client";

import { useActionState, useState } from "react";

import { saveSearchProfileAction } from "@/app/(protected)/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CareerProfileDraft } from "@jobwarden/domain";
import type {
  ProfileActionState,
  SavedSearchProfile,
} from "@/lib/profile/types";

const initialState: ProfileActionState = { kind: "idle" };

export function SearchProfileForm({
  profile,
  searches,
  readOnly,
}: {
  profile: CareerProfileDraft | null;
  searches: readonly SavedSearchProfile[];
  readOnly: boolean;
}) {
  const existing = searches[0];
  const [name, setName] = useState(existing?.name ?? "My UK search");
  const [terms, setTerms] = useState(
    existing?.includeTerms.join(", ") ?? profile?.keywords.join(", ") ?? "",
  );
  const [locations, setLocations] = useState(
    existing?.ukLocations.join(", ") ?? "",
  );
  const [state, action, pending] = useActionState(
    saveSearchProfileAction,
    initialState,
  );
  const list = (value: string) => [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  const search = {
    name,
    enabled: true,
    roleFamilies: profile?.targetRoleFamilies ?? [],
    includeTerms: list(terms),
    excludeTerms: existing?.excludeTerms ?? [],
    industries: profile?.industries ?? [],
    domains: profile?.domains ?? [],
    skillConcepts:
      profile?.evidence
        .filter(
          (item) =>
            item.confirmationState === "confirmed" &&
            (item.category === "skill" || item.category === "tool"),
        )
        .map((item) => item.normalizedConcept) ?? [],
    responsibilityConcepts:
      profile?.evidence
        .filter(
          (item) =>
            item.confirmationState === "confirmed" &&
            item.category === "responsibility",
        )
        .map((item) => item.normalizedConcept) ?? [],
    currentSeniority: profile?.currentSeniority ?? "unspecified",
    targetSeniority: profile?.targetSeniority ?? "unspecified",
    employmentTypes: existing?.employmentTypes ?? [],
    workingTimes: existing?.workingTimes ?? [],
    workplaceTypes: existing?.workplaceTypes ?? [],
    ukLocations: list(locations),
    ir35Statuses: existing?.ir35Statuses ?? [],
    compensation: existing?.compensation ?? {
      minimum: null,
      maximum: null,
      period: "unknown" as const,
      allowUnknown: true,
    },
    recencyDays: existing?.recencyDays ?? (14 as const),
    notificationsEnabled: false,
  };

  return (
    <section
      aria-labelledby="named-search-heading"
      className="border-t border-[#dedbd2] py-8"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
        <form action={action} className="min-w-0 space-y-5">
          <input type="hidden" name="search" value={JSON.stringify(search)} />
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[#697181]">
              Reusable filters
            </p>
            <h2
              id="named-search-heading"
              className="mt-2 text-xl font-semibold tracking-[-0.02em]"
            >
              Named search
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#596173]">
              Turn your confirmed direction into a saved UK search.
              Notifications remain off until Task 14.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="search-name">Search name</Label>
              <Input
                id="search-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="search-locations">UK locations</Label>
              <Input
                id="search-locations"
                value={locations}
                onChange={(event) => setLocations(event.target.value)}
                placeholder="London, Manchester, Remote within the UK"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="search-terms">Include terms</Label>
              <Input
                id="search-terms"
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
                placeholder="implementation, measurement strategy"
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={readOnly || pending}>
              {pending ? "Saving…" : "Save named search"}
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
        <div className="border-l border-[#ece9e2] pl-0 lg:pl-6">
          <h3 className="text-sm font-semibold text-[#263248]">
            Saved searches
          </h3>
          {searches.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-[#596173]">
              No named searches yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#ece9e2] border-y border-[#ece9e2]">
              {searches.map((item) => (
                <li key={item.id} className="py-3 [overflow-wrap:anywhere]">
                  <p className="font-medium text-[#263248]">{item.name}</p>
                  <p className="mt-1 text-xs text-[#697181]">
                    {item.roleFamilies.length} role families ·{" "}
                    {item.ukLocations.length} locations · notifications off
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

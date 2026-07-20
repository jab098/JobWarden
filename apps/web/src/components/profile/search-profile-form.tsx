"use client";

import { useActionState, useEffect, useState } from "react";

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

function fieldsForSearch(
  search: SavedSearchProfile | null,
  profile: CareerProfileDraft | null,
  searchesIdentity: string,
) {
  return {
    selectedSearchId: search?.id ?? null,
    name: search?.name ?? "My UK search",
    terms:
      search?.includeTerms.join(", ") ?? profile?.keywords.join(", ") ?? "",
    locations: search?.ukLocations.join(", ") ?? "",
    notify: search?.notificationsEnabled ?? false,
    searchesIdentity,
    optimisticSearchId: null as string | null,
  };
}

export function SearchProfileForm({
  profile,
  searches,
  generation,
  readOnly,
  blocked,
  onPendingChange,
}: {
  profile: CareerProfileDraft | null;
  searches: readonly SavedSearchProfile[];
  generation: number;
  readOnly: boolean;
  blocked: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const searchesIdentity = searches.map(({ id }) => id).join(":");
  const [fields, setFields] = useState(() =>
    fieldsForSearch(searches[0] ?? null, profile, searchesIdentity),
  );
  let currentFields = fields;
  let existing = searches.find(
    (item) => item.id === currentFields.selectedSearchId,
  );
  if (
    currentFields.optimisticSearchId !== null &&
    existing?.id === currentFields.optimisticSearchId
  ) {
    currentFields = {
      ...currentFields,
      optimisticSearchId: null,
      searchesIdentity,
    };
    setFields(currentFields);
  }
  if (
    currentFields.selectedSearchId !== null &&
    existing === undefined &&
    currentFields.optimisticSearchId === null &&
    currentFields.searchesIdentity !== searchesIdentity
  ) {
    existing = searches[0];
    currentFields = fieldsForSearch(
      existing ?? null,
      profile,
      searchesIdentity,
    );
    setFields(currentFields);
  }
  const { selectedSearchId, name, terms, locations, notify } = currentFields;
  const [state, action, pending] = useActionState(
    async (previousState: ProfileActionState, formData: FormData) => {
      const result = await saveSearchProfileAction(previousState, formData);
      if (result.kind === "success" && result.resourceId) {
        setFields((current) => ({
          ...current,
          selectedSearchId: result.resourceId ?? null,
          searchesIdentity,
          optimisticSearchId: result.resourceId ?? null,
        }));
      }
      return result;
    },
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

  useEffect(() => onPendingChange(pending), [onPendingChange, pending]);
  function selectSearch(search: SavedSearchProfile | null) {
    setFields(fieldsForSearch(search, profile, searchesIdentity));
  }

  const newSearch: Omit<SavedSearchProfile, "id"> = {
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
    notificationsEnabled: notify,
  };
  const search = existing
    ? {
        ...existing,
        id: undefined,
        name,
        includeTerms: list(terms),
        ukLocations: list(locations),
        notificationsEnabled: notify,
      }
    : newSearch;

  return (
    <section
      aria-labelledby="named-search-heading"
      className="mt-3 card-surface p-5"
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
        <form
          action={action}
          className="min-w-0 space-y-5"
          onSubmit={() => onPendingChange(true)}
        >
          <input type="hidden" name="searchId" value={selectedSearchId ?? ""} />
          <input type="hidden" name="profileGeneration" value={generation} />
          <input type="hidden" name="search" value={JSON.stringify(search)} />
          <div>
            <h2
              id="named-search-heading"
              className="text-base font-semibold tracking-[-0.01em]"
            >
              Named search
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
              Turn your confirmed direction into a saved UK search, and choose
              whether its new matches reach you by email.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="search-name">Search name</Label>
              <Input
                id="search-name"
                value={name}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                maxLength={80}
                disabled={readOnly || pending || blocked}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="search-locations">UK locations</Label>
              <Input
                id="search-locations"
                value={locations}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    locations: event.target.value,
                  }))
                }
                placeholder="London, Manchester, Remote within the UK"
                disabled={readOnly || pending || blocked}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="search-terms">Include terms</Label>
              <Input
                id="search-terms"
                value={terms}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    terms: event.target.value,
                  }))
                }
                placeholder="implementation, measurement strategy"
                disabled={readOnly || pending || blocked}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      notify: event.target.checked,
                    }))
                  }
                  disabled={readOnly || pending || blocked}
                  className="mt-0.5 size-4 accent-(--link)"
                />
                <span>
                  Email me this search&rsquo;s new matches
                  <span className="mt-1 block text-ink-secondary">
                    At most one digest per weekday slot, only when there is
                    something new. Digest emails must also be on in the
                    scheduled updates section below.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={readOnly || pending || blocked}>
              {pending ? "Saving…" : "Save named search"}
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
        <div className="border-l border-border pl-0 lg:pl-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Saved searches
            </h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={readOnly || pending || blocked}
              onClick={() => selectSearch(null)}
            >
              New search
            </Button>
          </div>
          {searches.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-ink-secondary">
              No named searches yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {searches.map((item) => (
                <li key={item.id} className="py-3 [overflow-wrap:anywhere]">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Edit ${item.name}`}
                    aria-pressed={item.id === selectedSearchId}
                    disabled={readOnly || pending || blocked}
                    onClick={() => selectSearch(item)}
                    className="h-auto w-full justify-start px-1 py-1 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-ink-faint">
                        {item.roleFamilies.length} role families ·{" "}
                        {item.ukLocations.length} locations ·{" "}
                        {item.notificationsEnabled
                          ? "notifications on"
                          : "notifications off"}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

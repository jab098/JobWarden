"use client";

import { Check } from "lucide-react";

import {
  employmentTypes,
  ir35Statuses,
  seniorityLevels,
  workingTimes,
  workplaceTypes,
} from "@jobwarden/domain";

import { formatJobLabel } from "@/components/jobs/job-format";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OnboardingAnswers } from "@jobwarden/domain";

/**
 * The onboarding questions, as plain form controls. They post inside the same
 * server action that records the step, so every answer is saved before the user
 * is advanced past the question that produced it.
 *
 * `unknown` is deliberately absent from every allow-list group: the matching
 * gate never excludes a listing that does not state a value, so offering it as
 * a choice would imply a constraint that does not exist.
 */

const ir35Labels: Record<string, string> = {
  inside: "Inside IR35",
  outside: "Outside IR35",
  not_applicable: "IR35 not applicable",
};

const seniorityLabels: Record<string, string> = {
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
  head: "Head of",
  director: "Director",
  executive: "Executive",
};

function FieldShell({
  label,
  hint,
  children,
  asLabel = true,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  asLabel?: boolean;
}) {
  const Element = asLabel ? "label" : "div";
  return (
    <Element className="block space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {hint ? (
        <span className="block text-xs leading-5 text-ink-faint">{hint}</span>
      ) : null}
      {children}
    </Element>
  );
}

export function ConceptListField({
  name,
  label,
  hint,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  placeholder: string;
  defaultValue: readonly string[] | undefined;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <Input
        name={name}
        defaultValue={(defaultValue ?? []).join(", ")}
        placeholder={placeholder}
        className="bg-card"
      />
    </FieldShell>
  );
}

const seniorityOptions = [
  ["", "No preference"] as const,
  ...seniorityLevels
    .filter((level) => level !== "unspecified")
    .map((level) => [level, seniorityLabels[level] ?? level] as const),
];

export function SeniorityField({
  defaultValue,
}: {
  defaultValue: OnboardingAnswers["targetSeniority"];
}) {
  return (
    <FieldShell
      label="The level you are aiming for"
      hint="Leave this unanswered if you are open to any level."
      asLabel={false}
    >
      <Select
        name="targetSeniority"
        // "unspecified" is the stored form of no preference; it is shown as
        // the empty option rather than as a level.
        defaultValue={
          defaultValue === undefined || defaultValue === "unspecified"
            ? ""
            : defaultValue
        }
        items={seniorityOptions.map(([value, label]) => ({ value, label }))}
      >
        <SelectTrigger
          aria-label="The level you are aiming for"
          className="w-full bg-card"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {seniorityOptions.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

/**
 * A multi-choice group rendered as selectable pills. The native checkboxes
 * stay in the form (visually hidden), so posting, labels, and keyboard
 * behaviour are unchanged; the pill and its check mark make "several can be
 * on at once" visible at a glance.
 */
function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  selected,
}: {
  name: string;
  legend: string;
  hint: string;
  options: readonly (readonly [string, string])[];
  selected: readonly string[] | undefined;
}) {
  const chosen = new Set(selected ?? []);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <p className="text-xs leading-5 text-ink-faint">{hint}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {options.map(([value, copy]) => (
          <label
            key={value}
            className="group flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-ink-secondary transition-[background-color,border-color,color] duration-(--duration-quick) ease-(--ease-smooth-out) select-none hover:border-input has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring/60"
          >
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={chosen.has(value)}
              className="sr-only"
            />
            <Check
              aria-hidden="true"
              strokeWidth={2.25}
              className="hidden size-3.5 group-has-checked:block"
            />
            {copy}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const anyHint = "Tick nothing to stay open to all of them.";

export function EmploymentTypeField({
  selected,
}: {
  selected: readonly string[] | undefined;
}) {
  return (
    <CheckboxGroup
      name="employmentTypes"
      legend="Contract types you would take"
      hint={`${anyHint} Listings that do not state a type are always included.`}
      options={employmentTypes
        .filter((type) => type !== "unknown")
        .map((type) => [type, formatJobLabel(type, type)] as const)}
      selected={selected}
    />
  );
}

export function WorkingTimeField({
  selected,
}: {
  selected: readonly string[] | undefined;
}) {
  return (
    <CheckboxGroup
      name="workingTimes"
      legend="Working pattern"
      hint={anyHint}
      options={workingTimes
        .filter((time) => time !== "unknown")
        .map((time) => [time, formatJobLabel(time, time)] as const)}
      selected={selected}
    />
  );
}

export function WorkplaceField({
  selected,
}: {
  selected: readonly string[] | undefined;
}) {
  return (
    <CheckboxGroup
      name="workplaceTypes"
      legend="Where you would work"
      hint={anyHint}
      options={workplaceTypes
        .filter((type) => type !== "unknown")
        .map((type) => [type, formatJobLabel(type, type)] as const)}
      selected={selected}
    />
  );
}

export function Ir35Field({
  selected,
}: {
  selected: readonly string[] | undefined;
}) {
  return (
    <CheckboxGroup
      name="ir35Statuses"
      legend="IR35 status, if you contract"
      hint="Only affects contract listings. Tick nothing if this does not apply to you."
      options={ir35Statuses
        .filter((status) => status !== "unknown")
        .map((status) => [status, ir35Labels[status] ?? status] as const)}
      selected={selected}
    />
  );
}

const periodOptions = [
  ["", "Not set"],
  ["year", "Year"],
  ["day", "Day"],
  ["hour", "Hour"],
  ["month", "Month"],
  ["week", "Week"],
] as const;

export function PayFloorField({
  minimum,
  period,
  allowUnknown,
}: {
  minimum: number | null | undefined;
  period: OnboardingAnswers["compensationPeriod"];
  allowUnknown: boolean | undefined;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldShell
          label="Lowest pay you would accept"
          hint="Whole pounds. Needs a period below, or it is not applied."
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={1_000_000}
            step={100}
            name="compensationMinimum"
            defaultValue={
              minimum === null || minimum === undefined ? "" : minimum / 100
            }
            placeholder="45000"
            className="bg-card"
          />
        </FieldShell>
        <FieldShell
          label="Per"
          hint="Match how the roles you want are advertised."
          asLabel={false}
        >
          <Select
            name="compensationPeriod"
            defaultValue={
              period === undefined || period === "unknown" ? "" : period
            }
            items={periodOptions.map(([value, label]) => ({ value, label }))}
          >
            <SelectTrigger aria-label="Per" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              {periodOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          name="allowUnknownCompensation"
          defaultChecked={allowUnknown ?? true}
          className="mt-0.5 size-4 rounded border-input accent-(--link) focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        />
        <span>
          Include roles that do not state a salary.{" "}
          <span className="text-ink-faint">
            Most UK adverts do not, so unticking this hides a large part of the
            market.
          </span>
        </span>
      </label>
    </div>
  );
}

export function ChoiceField({
  name,
  title,
  description,
  defaultChecked,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean | undefined;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm transition-[border-color,background-color] duration-(--duration-quick) ease-(--ease-smooth-out) hover:border-input has-checked:border-link/50 has-focus-visible:ring-2 has-focus-visible:ring-ring/60">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked ?? false}
        className="mt-0.5 size-4 rounded border-input accent-(--link)"
      />
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-1 block leading-6 text-ink-secondary">
          {description}
        </span>
      </span>
    </label>
  );
}

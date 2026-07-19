"use client";

import {
  employmentTypes,
  ir35Statuses,
  seniorityLevels,
  workingTimes,
  workplaceTypes,
} from "@jobwarden/domain";

import { formatJobLabel } from "@/components/jobs/job-format";
import { Input } from "@/components/ui/input";
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
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-[#263248]">{label}</span>
      {hint ? (
        <span className="block text-xs leading-5 text-[#697181]">{hint}</span>
      ) : null}
      {children}
    </label>
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
        className="h-10 rounded-md bg-white"
      />
    </FieldShell>
  );
}

export function SeniorityField({
  defaultValue,
}: {
  defaultValue: OnboardingAnswers["targetSeniority"];
}) {
  return (
    <FieldShell
      label="The level you are aiming for"
      hint="Leave this unanswered if you are open to any level."
    >
      <select
        name="targetSeniority"
        defaultValue={defaultValue ?? ""}
        className="h-10 w-full rounded-md border border-[#cbc7bd] bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
      >
        <option value="">No preference</option>
        {seniorityLevels
          .filter((level) => level !== "unspecified")
          .map((level) => (
            <option key={level} value={level}>
              {seniorityLabels[level] ?? level}
            </option>
          ))}
      </select>
    </FieldShell>
  );
}

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
      <legend className="text-sm font-medium text-[#263248]">{legend}</legend>
      <p className="text-xs leading-5 text-[#697181]">{hint}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {options.map(([value, copy]) => (
          <label
            key={value}
            className="flex items-center gap-2 text-sm text-[#40495a]"
          >
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={chosen.has(value)}
              className="size-4 rounded border-[#cbc7bd] accent-[#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
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
        <FieldShell label="Lowest pay you would accept" hint="Whole pounds.">
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
            className="h-10 rounded-md bg-white"
          />
        </FieldShell>
        <FieldShell
          label="Per"
          hint="Match how the roles you want are advertised."
        >
          <select
            name="compensationPeriod"
            defaultValue={period ?? ""}
            className="h-10 w-full rounded-md border border-[#cbc7bd] bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
          >
            <option value="">Not set</option>
            <option value="year">Year</option>
            <option value="day">Day</option>
            <option value="hour">Hour</option>
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>
        </FieldShell>
      </div>
      <label className="flex items-start gap-2 text-sm text-[#40495a]">
        <input
          type="checkbox"
          name="allowUnknownCompensation"
          defaultChecked={allowUnknown ?? true}
          className="mt-0.5 size-4 rounded border-[#cbc7bd] accent-[#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        />
        <span>
          Include roles that do not state a salary.{" "}
          <span className="text-[#697181]">
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
    <label className="flex items-start gap-3 rounded-md border border-[#e7e3da] bg-white p-4 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked ?? false}
        className="mt-0.5 size-4 rounded border-[#cbc7bd] accent-[#2458a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
      />
      <span>
        <span className="block font-medium text-[#263248]">{title}</span>
        <span className="mt-1 block leading-6 text-[#596173]">
          {description}
        </span>
      </span>
    </label>
  );
}

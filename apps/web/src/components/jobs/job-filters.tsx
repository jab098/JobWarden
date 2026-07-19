import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { JobFilters } from "@/lib/jobs/types";

const options = {
  employment: [
    ["all", "All employment"],
    ["permanent", "Permanent"],
    ["fixed_term", "Fixed term"],
    ["contract", "Contract"],
    ["temporary", "Temporary"],
    ["apprenticeship", "Apprenticeship"],
    ["internship", "Internship"],
    ["casual", "Casual"],
    ["zero_hours", "Zero hours"],
    ["unknown", "Not stated"],
  ],
  workingTime: [
    ["all", "All working times"],
    ["full_time", "Full time"],
    ["part_time", "Part time"],
    ["flexible", "Flexible"],
    ["unknown", "Not stated"],
  ],
  workplace: [
    ["all", "All workplaces"],
    ["onsite", "On site"],
    ["hybrid", "Hybrid"],
    ["remote", "Remote"],
    ["unknown", "Not stated"],
  ],
  ir35: [
    ["all", "All IR35 statuses"],
    ["inside", "Inside IR35"],
    ["outside", "Outside IR35"],
    ["not_applicable", "Not applicable"],
    ["unknown", "Not stated"],
  ],
  compensation: [
    ["all", "All salary information"],
    ["advertised", "Advertised salary"],
    ["estimated", "Estimated salary"],
    ["unknown", "Salary not stated"],
  ],
  posted: [
    ["any", "Any time"],
    ["1", "Last 24 hours"],
    ["3", "Last 3 days"],
    ["7", "Last week"],
    ["14", "Last 2 weeks"],
    ["30", "Last month"],
  ],
  salaryPeriod: [
    ["all", "Not set"],
    ["year", "Per year"],
    ["day", "Per day"],
    ["hour", "Per hour"],
    ["month", "Per month"],
    ["week", "Per week"],
  ],
} as const;

const selectClass =
  "h-10 w-full rounded-md border border-[#cbc7bd] bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]";

function FilterForm({ filters }: { filters: JobFilters }) {
  return (
    <form
      aria-label="Search jobs"
      method="get"
      action="/jobs"
      className="space-y-5"
    >
      {/* Sort survives a filter change, but the page cannot: the result set
          the old page number referred to no longer exists. */}
      <input type="hidden" name="sort" value={filters.sort} />
      {/* The hint sits outside the label so the field's accessible name stays
          "Keywords" rather than absorbing the whole sentence. */}
      <div className="space-y-2">
        <label className="block space-y-2 text-sm font-medium">
          <span>Keywords</span>
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Role, employer, or skill"
            className="h-10 rounded-md bg-white"
          />
        </label>
        <p className="text-xs text-[#697181]">
          Searches the job title, the employer, and the advert itself.
        </p>
      </div>
      <label className="block space-y-2 text-sm font-medium">
        <span>Location</span>
        <Input
          name="location"
          defaultValue={filters.location}
          placeholder="Manchester"
          className="h-10 rounded-md bg-white"
        />
      </label>
      {(
        [
          ["posted", "Date posted"],
          ["employment", "Employment type"],
          ["workingTime", "Working time"],
          ["workplace", "Workplace"],
          ["ir35", "IR35 status"],
          ["compensation", "Salary information"],
        ] as const
      ).map(([name, label]) => (
        <label key={name} className="block space-y-2 text-sm font-medium">
          <span>{label}</span>
          <select
            name={name}
            defaultValue={filters[name]}
            className={selectClass}
          >
            {options[name].map(([value, copy]) => (
              <option key={value} value={value}>
                {copy}
              </option>
            ))}
          </select>
        </label>
      ))}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Minimum salary</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={1_000_000}
            step={500}
            name="salaryMin"
            aria-label="Minimum salary in pounds"
            defaultValue={filters.salaryMin ?? ""}
            placeholder="30000"
            className="h-10 rounded-md bg-white"
          />
          <select
            name="salaryPeriod"
            aria-label="Salary period"
            defaultValue={filters.salaryPeriod}
            className={selectClass}
          >
            {options.salaryPeriod.map(([value, copy]) => (
              <option key={value} value={value}>
                {copy}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-[#697181]">
          Needs both an amount and a period, so a day rate is never compared
          against a yearly salary. Setting one hides listings with no stated
          salary, because they cannot be shown to meet it.
        </p>
      </fieldset>
      <div className="flex items-center gap-3 pt-1">
        <Button
          type="submit"
          className="h-10 rounded-md bg-[#2458a6] px-4 text-white hover:bg-[#1d477f] focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          Search
        </Button>
        <Link
          href="/jobs"
          className="rounded-sm text-sm text-[#2458a6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458a6]"
        >
          Clear all
        </Link>
      </div>
    </form>
  );
}

export function JobFilters({
  filters,
  variant,
}: {
  filters: JobFilters;
  variant: "desktop" | "mobile";
}) {
  if (variant === "desktop") {
    return (
      <aside className="h-full border-r border-[#e1ded6] bg-[#faf9f6] p-6">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.12em] text-[#596173]">
          Refine results
        </h2>
        <FilterForm filters={filters} />
      </aside>
    );
  }

  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="outline"
              className="h-10 rounded-md border-[#cbc7bd] bg-white focus-visible:ring-2 focus-visible:ring-[#2458a6]"
              aria-label="Open job filters"
            />
          }
        >
          <SlidersHorizontal aria-hidden="true" /> Filters
        </SheetTrigger>
        <SheetContent
          aria-label="Search jobs"
          className="w-[min(24rem,92vw)] overflow-y-auto bg-[#faf9f6] p-0"
        >
          <SheetHeader className="border-b border-[#dedbd2] px-6 py-5">
            <SheetTitle>Search jobs</SheetTitle>
            <SheetDescription>Narrow the UK listings shown.</SheetDescription>
          </SheetHeader>
          <div className="p-6">
            <FilterForm filters={filters} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

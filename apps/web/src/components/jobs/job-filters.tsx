import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import { radiusOptions } from "@jobwarden/domain";

import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/jobs/filter-select";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { salaryPeriods, type JobFilters } from "@/lib/jobs/types";

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
} as const;

const salaryPeriodLabels: Record<(typeof salaryPeriods)[number], string> = {
  year: "Per year",
  month: "Per month",
  week: "Per week",
  day: "Per day",
  hour: "Per hour",
};

// Derived from the vocabulary the schema accepts, so an offered period and a
// valid one cannot drift apart.
const salaryPeriodOptions = [
  ["all", "Not set"],
  ...salaryPeriods.map(
    (period) => [period, salaryPeriodLabels[period]] as const,
  ),
] as const;

function FilterForm({ filters }: { filters: JobFilters }) {
  return (
    <form
      aria-label="Refine job search"
      method="get"
      action="/jobs"
      className="space-y-5"
    >
      {/* Sort survives a filter change, but the page cannot: the result set
          the old page number referred to no longer exists. */}
      <input type="hidden" name="sort" value={filters.sort} />
      {/* The hint sits outside the label so the field's accessible name stays
          "Keywords" rather than absorbing the whole sentence. */}
      <div className="space-y-1.5">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Keywords</span>
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Role, employer, or skill"
            className="bg-card"
          />
        </label>
        <p className="text-xs leading-5 text-ink-faint">
          Searches the job title, the employer, and the advert itself.
        </p>
      </div>
      <div className="space-y-3">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Location</span>
          <Input
            name="location"
            defaultValue={filters.location}
            placeholder="Manchester"
            className="bg-card"
          />
        </label>
        <FilterSelect
          name="radius"
          label="Distance"
          defaultValue={filters.radius === null ? "" : String(filters.radius)}
          options={[
            ["", "This place only"],
            ...radiusOptions.map(
              (miles) => [String(miles), `Within ${miles} miles`] as const,
            ),
          ]}
        />
        <p className="text-xs leading-5 text-ink-faint">
          A distance also finds nearby towns. Within 10 miles of Manchester
          includes Salford and Trafford Park.
        </p>
      </div>
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
        <FilterSelect
          key={name}
          name={name}
          label={label}
          defaultValue={filters[name]}
          options={options[name]}
        />
      ))}
      <fieldset className="space-y-1.5">
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
            className="bg-card"
          />
          <FilterSelect
            name="salaryPeriod"
            label="Salary period"
            defaultValue={filters.salaryPeriod}
            options={salaryPeriodOptions}
            hideLabel
          />
        </div>
        <p className="text-xs leading-5 text-ink-faint">
          Needs both an amount and a period, so a day rate is never compared
          against a yearly salary. Setting one hides listings with no stated
          salary, because they cannot be shown to meet it.
        </p>
      </fieldset>
      <div className="flex items-center gap-3 pt-1">
        <Button type="submit">Search</Button>
        <Link
          href="/jobs"
          className="rounded-sm text-sm text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
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
      <aside className="h-full p-5 lg:p-6">
        <h2 className="mb-5 text-sm font-semibold text-foreground">Filters</h2>
        <FilterForm filters={filters} />
      </aside>
    );
  }

  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger
          render={<Button variant="outline" aria-label="Open job filters" />}
        >
          <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} /> Filters
        </SheetTrigger>
        <SheetContent className="w-[min(24rem,92vw)] overflow-y-auto bg-background p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>Job search filters</SheetTitle>
            <SheetDescription>Narrow the UK listings shown.</SheetDescription>
          </SheetHeader>
          <div className="p-5">
            <FilterForm filters={filters} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";

import { radiusOptions } from "@jobwarden/domain";

import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/jobs/filter-select";
import { MultiFilterSelect } from "@/components/jobs/multi-filter-select";
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
import type { JobSourceOption } from "@/lib/sources/types";

const options = {
  employment: [
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
    ["full_time", "Full time"],
    ["part_time", "Part time"],
    ["flexible", "Flexible"],
    ["unknown", "Not stated"],
  ],
  workplace: [
    ["onsite", "On site"],
    ["hybrid", "Hybrid"],
    ["remote", "Remote"],
    ["unknown", "Not stated"],
  ],
  ir35: [
    ["inside", "Inside IR35"],
    ["outside", "Outside IR35"],
    ["not_applicable", "Not applicable"],
    ["unknown", "Not stated"],
  ],
  compensation: [
    ["advertised", "Advertised salary"],
    ["estimated", "Estimated salary"],
    ["unknown", "Salary not stated"],
  ],
} as const;

const postedOptions = [
  ["any", "Any time"],
  ["1", "Last 24 hours"],
  ["3", "Last 3 days"],
  ["7", "Last week"],
  ["14", "Last 2 weeks"],
  ["30", "Last month"],
] as const;

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

const radiusSelectOptions = [
  ["", "This place only"],
  ...radiusOptions.map(
    (miles) => [String(miles), `Within ${miles} miles`] as const,
  ),
] as const;

const multiFilters = [
  ["employment", "Employment type", "All employment"],
  ["workingTime", "Working time", "All working times"],
  ["workplace", "Workplace", "All workplaces"],
  ["ir35", "IR35 status", "All IR35 statuses"],
  ["compensation", "Salary information", "All salary information"],
] as const;

function SourcesControl({
  sources,
  selected,
  submitOnClose,
}: {
  sources: readonly JobSourceOption[];
  selected: readonly string[];
  submitOnClose: boolean;
}) {
  if (sources.length === 0) return null;
  return (
    <MultiFilterSelect
      name="source"
      label="Sources"
      allLabel="All sources"
      options={sources.map((source) => [source.id, source.label] as const)}
      selected={selected}
      submitOnClose={submitOnClose}
    />
  );
}

/**
 * The desktop filters as a horizontal toolbar over the results: search
 * fields and a submit up top, then compact dropdowns beneath. Multi-choice
 * dropdowns apply when their popup closes; single-choice ones on selection.
 * One GET form, same field contract as ever.
 */
function FilterToolbar({
  filters,
  sources,
}: {
  filters: JobFilters;
  sources: readonly JobSourceOption[];
}) {
  return (
    <form
      aria-label="Refine job search"
      method="get"
      action="/jobs"
      className="card-surface p-3"
    >
      <input type="hidden" name="sort" value={filters.sort} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            name="q"
            aria-label="Keywords"
            defaultValue={filters.q}
            placeholder="Role, employer, or words in the advert"
            className="bg-card pl-8"
          />
        </div>
        <Input
          name="location"
          aria-label="Location"
          defaultValue={filters.location}
          placeholder="Anywhere in the UK"
          className="w-44 bg-card"
        />
        <FilterSelect
          name="radius"
          label="Distance"
          variant="pill"
          defaultValue={filters.radius === null ? "" : String(filters.radius)}
          options={radiusSelectOptions}
        />
        <SourcesControl
          sources={sources}
          selected={filters.sources}
          submitOnClose
        />
        <Button type="submit" size="sm" className="h-8 px-3">
          Search
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
        <FilterSelect
          name="posted"
          label="Date posted"
          variant="pill"
          submitOnChange
          defaultValue={filters.posted}
          options={postedOptions}
        />
        {multiFilters.map(([name, label, allLabel]) => (
          <MultiFilterSelect
            key={name}
            name={name}
            label={label}
            allLabel={allLabel}
            options={options[name]}
            selected={filters[name]}
            submitOnClose
          />
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={1_000_000}
          step={500}
          name="salaryMin"
          aria-label="Minimum salary in pounds"
          defaultValue={filters.salaryMin ?? ""}
          placeholder="Min pay"
          className="h-7 w-24 bg-card text-[0.8rem]"
        />
        <FilterSelect
          name="salaryPeriod"
          label="Salary period"
          variant="pill"
          defaultValue={filters.salaryPeriod}
          options={salaryPeriodOptions}
        />
        <span className="ml-auto flex items-center gap-3">
          <Link
            href="/sources"
            className="rounded-sm px-1 text-xs font-medium text-ink-faint outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Manage sources
          </Link>
          <Link
            href="/jobs"
            className="rounded-sm px-1 text-xs font-medium text-link outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Clear all
          </Link>
        </span>
      </div>
    </form>
  );
}

/** The stacked field layout used inside the mobile filter sheet. */
function FilterForm({
  filters,
  sources,
}: {
  filters: JobFilters;
  sources: readonly JobSourceOption[];
}) {
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
          options={radiusSelectOptions}
        />
        <p className="text-xs leading-5 text-ink-faint">
          A distance also finds nearby towns. Within 10 miles of Manchester
          includes Salford and Trafford Park.
        </p>
      </div>
      {sources.length > 0 ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Sources</span>
          <SourcesControl
            sources={sources}
            selected={filters.sources}
            submitOnClose={false}
          />
        </div>
      ) : null}
      <FilterSelect
        name="posted"
        label="Date posted"
        defaultValue={filters.posted}
        options={postedOptions}
      />
      {multiFilters.map(([name, label, allLabel]) => (
        <div key={name} className="space-y-1.5">
          <span className="block text-sm font-medium">{label}</span>
          <MultiFilterSelect
            name={name}
            label={label}
            allLabel={allLabel}
            options={options[name]}
            selected={filters[name]}
            submitOnClose={false}
          />
        </div>
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
  sources = [],
}: {
  filters: JobFilters;
  variant: "desktop" | "mobile";
  sources?: readonly JobSourceOption[];
}) {
  if (variant === "desktop") {
    return <FilterToolbar filters={filters} sources={sources} />;
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
            <FilterForm filters={filters} sources={sources} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

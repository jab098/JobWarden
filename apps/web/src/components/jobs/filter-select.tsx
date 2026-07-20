"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * A labelled, form-participating custom dropdown. Base UI serialises the
 * chosen value into a hidden input carrying `name`, so the surrounding GET
 * form submits exactly what a native select would have.
 */
export function FilterSelect({
  name,
  label,
  options,
  defaultValue,
  hideLabel = false,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  defaultValue: string;
  hideLabel?: boolean;
}) {
  return (
    <div className={hideLabel ? undefined : "space-y-1.5"}>
      {hideLabel ? null : (
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
      )}
      <Select
        name={name}
        defaultValue={defaultValue}
        items={options.map(([value, optionLabel]) => ({
          value,
          label: optionLabel,
        }))}
      >
        <SelectTrigger aria-label={label} className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {options.map(([value, optionLabel]) => (
            <SelectItem key={value} value={value}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

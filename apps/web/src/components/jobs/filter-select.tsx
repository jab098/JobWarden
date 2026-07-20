"use client";

import { useRef } from "react";

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
 *
 * `variant="pill"` renders the compact toolbar form: no visible label (the
 * option copy is self-describing) and, with `submitOnChange`, the form is
 * submitted as soon as a value is picked, so results follow each choice.
 */
export function FilterSelect({
  name,
  label,
  options,
  defaultValue,
  hideLabel = false,
  variant = "field",
  submitOnChange = false,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  defaultValue: string;
  hideLabel?: boolean;
  variant?: "field" | "pill";
  submitOnChange?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const items = options.map(([value, optionLabel]) => ({
    value,
    label: optionLabel,
  }));
  const pill = variant === "pill";

  return (
    <div
      ref={anchorRef}
      className={pill || hideLabel ? undefined : "space-y-1.5"}
    >
      {pill || hideLabel ? null : (
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
      )}
      <Select
        name={name}
        defaultValue={defaultValue}
        items={items}
        onValueChange={
          submitOnChange
            ? () => {
                // Let Base UI write the hidden input before the form reads it.
                setTimeout(() => {
                  anchorRef.current?.closest("form")?.requestSubmit();
                }, 0);
              }
            : undefined
        }
      >
        <SelectTrigger
          aria-label={label}
          size={pill ? "sm" : "default"}
          className={
            pill
              ? "max-w-48 bg-card font-medium text-ink-secondary data-popup-open:border-ring/50 data-popup-open:text-foreground"
              : "w-full bg-card"
          }
        >
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

"use client";

import { useRef, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/**
 * A multi-choice dropdown for the filter toolbar. The popup stays open while
 * several values are ticked; the surrounding GET form is submitted when the
 * popup closes, so one visit can change the whole set. Chosen values are
 * serialised as one hidden input each, plus a constant empty entry so the
 * field name always reaches the server (and an emptied set clears it).
 */
export function MultiFilterSelect({
  name,
  label,
  allLabel,
  options,
  selected,
  submitOnClose = true,
}: {
  name: string;
  label: string;
  /** Trigger copy when nothing is chosen, e.g. "All workplaces". */
  allLabel: string;
  options: ReadonlyArray<readonly [string, string]>;
  selected: readonly string[];
  /** The sheet variant keeps its explicit Search button instead. */
  submitOnClose?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<readonly string[]>(selected);
  const changedRef = useRef(false);

  const labels = new Map(
    options.map(([value, optionLabel]) => [value, optionLabel]),
  );
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? (labels.get(chosen[0]!) ?? allLabel)
        : `${label}: ${chosen.length}`;

  return (
    <div ref={anchorRef}>
      <input type="hidden" name={name} value="" />
      {chosen.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <Select
        multiple
        value={[...chosen]}
        onValueChange={(value) => {
          changedRef.current = true;
          setChosen((value as string[]) ?? []);
        }}
        onOpenChange={(open) => {
          if (open || !changedRef.current || !submitOnClose) return;
          changedRef.current = false;
          // After the close, the hidden inputs above already hold the new
          // set; submitting applies every tick from this visit at once.
          setTimeout(() => {
            anchorRef.current?.closest("form")?.requestSubmit();
          }, 0);
        }}
      >
        <SelectTrigger
          aria-label={label}
          size="sm"
          className={
            chosen.length > 0
              ? "max-w-52 bg-card font-medium text-foreground"
              : "max-w-52 bg-card font-medium text-ink-secondary"
          }
        >
          <span className="truncate">{summary}</span>
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

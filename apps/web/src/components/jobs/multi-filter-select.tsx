"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

type Options = ReadonlyArray<readonly [string, string]>;

type MultiFilterSelectProps = {
  name: string;
  label: string;
  /** Trigger copy when nothing is chosen, e.g. "All workplaces". */
  allLabel: string;
  options: Options;
  selected: readonly string[];
  /** The sheet variant keeps its explicit Search button instead. */
  applyOnChange?: boolean;
};

/**
 * A multi-choice dropdown for the filter toolbar. In the toolbar each tick
 * applies straight away and the popup stays open, so a reader watching the
 * results can keep narrowing without reopening the same menu. In the mobile
 * sheet the ticks only accumulate, because that layout applies everything at
 * once through its own Search button.
 *
 * The two variants keep their chosen set in different hooks and so are
 * different components: the live one has to reconcile with what the server
 * sent back, the sheet one has nothing to reconcile with.
 */
export function MultiFilterSelect(props: MultiFilterSelectProps) {
  return props.applyOnChange === false ? (
    <PendingMultiFilterSelect {...props} />
  ) : (
    <LiveMultiFilterSelect {...props} />
  );
}

/**
 * Applies on every tick as a soft navigation. A real form submit reloads the
 * document, which would unmount the open popup and lose the reader's place.
 *
 * The URL is built from the enclosing GET form, so the field contract is the
 * same one the Search button posts and there is no second place that knows how
 * a filter is serialised.
 */
function LiveMultiFilterSelect({ name, ...rest }: MultiFilterSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();
  // While a navigation is in flight the ticked boxes are the ones the reader
  // just clicked, not the ones the last server render knew about. React drops
  // the optimistic set once the new render lands, so a rapid second tick is
  // not undone by the first tick's response arriving late, and an outside
  // change of the URL (Clear all, the back button) still resets the control.
  const [chosen, setChosen] = useOptimistic(rest.selected);

  function urlFor(next: readonly string[]): string | null {
    const form = anchorRef.current?.closest("form");
    if (!form) return null;
    const params = new URLSearchParams();
    for (const [key, entry] of new FormData(form).entries()) {
      if (typeof entry === "string") params.append(key, entry);
    }
    // The hidden inputs still hold the previous set; this field is rewritten
    // from the value in hand rather than read back out of the DOM.
    params.delete(name);
    params.append(name, "");
    for (const value of next) params.append(name, value);
    // A filter change invalidates the page number: the result set the old page
    // referred to no longer exists.
    params.delete("page");
    return `${form.getAttribute("action") ?? ""}?${params.toString()}`;
  }

  return (
    <div ref={anchorRef}>
      <SelectBody
        {...rest}
        name={name}
        chosen={chosen}
        onChange={(next) => {
          const url = urlFor(next);
          startTransition(() => {
            setChosen(next);
            if (url !== null) router.replace(url, { scroll: false });
          });
        }}
      />
    </div>
  );
}

/** Accumulates ticks for the sheet's own Search button to submit. */
function PendingMultiFilterSelect({
  selected,
  ...rest
}: MultiFilterSelectProps) {
  const [chosen, setChosen] = useState<readonly string[]>(selected);
  return (
    <SelectBody
      {...rest}
      selected={selected}
      chosen={chosen}
      onChange={setChosen}
    />
  );
}

/**
 * Chosen values are serialised as one hidden input each, plus a constant empty
 * entry so the field name always reaches the server and an emptied set clears
 * it. Both variants need those inputs: the sheet submits them, and the toolbar
 * keeps them so its Search button posts the same set the URL already holds.
 */
function SelectBody({
  name,
  label,
  allLabel,
  options,
  chosen,
  onChange,
}: Omit<MultiFilterSelectProps, "selected" | "applyOnChange"> & {
  selected?: readonly string[];
  chosen: readonly string[];
  onChange: (next: readonly string[]) => void;
}) {
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
    <>
      <input type="hidden" name={name} value="" />
      {chosen.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <Select
        multiple
        value={[...chosen]}
        onValueChange={(value) => onChange((value as string[]) ?? [])}
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
    </>
  );
}

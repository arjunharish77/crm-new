"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { badgeVariants } from "@/components/ui/badge";
import { statusDisplay, type StatusDisplay, type StatusKind } from "@/lib/display/status";
import { cn } from "@/lib/utils";

// An editable status: the same tinted pill as StatusBadge, with a chevron (decision 25 -- the
// chevron appears only where the status can be changed). The current value is always listed,
// even when it isn't one of `options` (a custom or retired status), so it never shows blank.
// Labels and tones come from `kind` (the fixed maps) or `display` (e.g. tenant lead statuses).
export function StatusSelect({
  kind,
  display,
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  kind?: StatusKind;
  display?: (value: string) => StatusDisplay;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const resolve = display ?? ((option: string) => statusDisplay(kind ?? "lifecycle", option));
  const current = resolve(value);
  const choices = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          badgeVariants({ tone: current.tone }),
          "h-6 w-fit gap-1 py-0 shadow-none [&_svg]:size-3 [&_svg]:opacity-70",
          className,
        )}
      >
        {current.label}
      </SelectTrigger>
      {/* Anchored below the pill: the default item-aligned position put the menu off-screen for
          a small trigger. Pointer and click events stop here so a table row never opens behind it. */}
      <SelectContent position="popper" align="start" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        {choices.map((option) => (
          <SelectItem key={option} value={option}>{resolve(option).label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

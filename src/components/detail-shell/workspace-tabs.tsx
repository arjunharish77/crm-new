"use client";

// Gap checklist Module 10's "detail-page productivity shell" item -- consolidates the `WorkspaceTab`
// button + active-state class logic that the Lead and Opportunity detail pages each independently
// hand-rolled as a private, byte-for-byte-duplicated helper into one shared component, so the two
// pages' tab bars are visually and behaviorally consistent by construction rather than by
// copy-paste discipline. Each page keeps its own tab VALUES/labels/counts (no renaming here --
// that's a page-level content decision, not a shell concern).
import { cn } from "@/lib/utils";

export type WorkspaceTabDef<T extends string = string> = { value: T; label: string };

export function WorkspaceTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<WorkspaceTabDef<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  // One row of underline tabs (UI/UX plan §10.7): the accent marks only the current tab, and the
  // row scrolls sideways on narrow screens instead of wrapping onto a second line.
  return (
    <div className="border-b bg-card px-2">
      <div role="group" aria-label="Record workspace sections" className="-mb-px flex min-w-0 max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={value === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "h-10 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              value === tab.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

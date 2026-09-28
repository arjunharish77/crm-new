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
  return (
    <div className="border-b bg-surface-container-lowest px-2 py-2">
      <div role="group" aria-label="Record workspace sections" className="flex min-w-0 max-w-full flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={value === tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "min-h-[34px] min-w-0 max-w-full whitespace-normal break-words py-2 text-left rounded-lg px-3 text-[0.82rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === tab.value
                ? "bg-primary font-extrabold text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";

export type PageTab<T extends string = string> = { value: T; label: React.ReactNode; count?: number };

// Page-level tabs (UI/UX plan Phase 1): one row of underline tabs whose current value lives in the
// URL (?tab=...), so a reload, a shared link or Back keeps the same tab. Proper tab semantics
// with arrow-key movement between tabs. Render the panel for `value` yourself, or use the
// returned value from usePageTab.
export function usePageTab<T extends string>(tabs: readonly PageTab<T>[], fallback: T, key = "tab") {
    return useUrlState<T>(key, fallback, { allowed: tabs.map((tab) => tab.value) });
}

export function PageTabs<T extends string>({ tabs, value, onChange, label, className }: {
    tabs: readonly PageTab<T>[];
    value: T;
    onChange: (value: T) => void;
    label: string;
    className?: string;
}) {
    const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const move = (index: number) => {
        const next = (index + tabs.length) % tabs.length;
        refs.current[next]?.focus();
        onChange(tabs[next].value);
    };
    return (
        <div role="tablist" aria-label={label} className={cn("-mb-px flex min-w-0 gap-1 overflow-x-auto border-b [scrollbar-width:none]", className)}>
            {tabs.map((tab, index) => {
                const selected = tab.value === value;
                return (
                    <button
                        key={tab.value}
                        ref={(node) => { refs.current[index] = node; }}
                        type="button"
                        role="tab"
                        id={`tab-${tab.value}`}
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(tab.value)}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowRight") { event.preventDefault(); move(index + 1); }
                            if (event.key === "ArrowLeft") { event.preventDefault(); move(index - 1); }
                            if (event.key === "Home") { event.preventDefault(); move(0); }
                            if (event.key === "End") { event.preventDefault(); move(tabs.length - 1); }
                        }}
                        className={cn(
                            "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {tab.label}
                        {typeof tab.count === "number" ? <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{tab.count.toLocaleString()}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}

// A small choice between two to five views of the same thing (List / Board, Day / Week).
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: {
    options: readonly { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
    value: T;
    onChange: (value: T) => void;
    label: string;
    className?: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className={cn("inline-flex items-center rounded-md border border-border-strong bg-card p-0.5", className)}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
                            selected ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {option.icon}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

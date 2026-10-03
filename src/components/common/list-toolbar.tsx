"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type QuickFilter<T extends string = string> = { value: T; label: string; count?: number };
export type FilterChip = { id: string; label: string; onRemove: () => void };

// The one-row list toolbar (UI/UX plan rule R6, Phase 1 item 5): search, quick filters and the
// active filter chips on the left; saved views, filters, export and other actions on the right.
// It can be passed to DataTable's `toolbarActions`, or used above any list.
export function ListToolbar<T extends string>({
    search,
    quickFilters,
    quickFilter,
    onQuickFilterChange,
    chips,
    onClearAll,
    actions,
    className,
}: {
    search?: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; inputId?: string };
    quickFilters?: readonly QuickFilter<T>[];
    quickFilter?: T;
    onQuickFilterChange?: (value: T) => void;
    chips?: FilterChip[];
    onClearAll?: () => void;
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", className)}>
            {search ? <DebouncedSearch {...search} /> : null}
            {quickFilters?.length ? (
                <div role="radiogroup" aria-label="Quick filters" className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                    {quickFilters.map((filter) => {
                        const selected = filter.value === quickFilter;
                        return (
                            <button
                                key={filter.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => onQuickFilterChange?.(filter.value)}
                                className={cn(
                                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    selected ? "border-transparent bg-selected text-primary" : "border-border-strong text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {filter.label}
                                {typeof filter.count === "number" ? <span className="tabular-nums opacity-80">{filter.count.toLocaleString()}</span> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            {chips?.length ? (
                <ul aria-label="Active filters" className="flex flex-wrap items-center gap-1">
                    {chips.map((chip) => (
                        <li key={chip.id}>
                            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-sm">
                                {chip.label}
                                <button type="button" onClick={chip.onRemove} aria-label={`Remove filter: ${chip.label}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-surface-container-highest hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <X className="size-3.5" />
                                </button>
                            </span>
                        </li>
                    ))}
                    {onClearAll && chips.length > 1 ? (
                        <li><Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClearAll}>Clear all</Button></li>
                    ) : null}
                </ul>
            ) : null}
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}

// Waits 300ms after typing stops before calling onChange, so a list isn't refetched per keystroke.
function DebouncedSearch({ value, onChange, placeholder = "Search", label = "Search", inputId }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; inputId?: string }) {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    React.useEffect(() => {
        if (draft === value) return;
        const timer = window.setTimeout(() => onChange(draft), 300);
        return () => window.clearTimeout(timer);
    }, [draft, value, onChange]);
    return (
        <div className="relative w-full sm:w-64">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
                id={inputId}
                type="search"
                aria-label={label}
                value={draft}
                placeholder={placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") onChange(draft); if (event.key === "Escape" && draft) { setDraft(""); onChange(""); } }}
                className="h-8 pl-8"
            />
        </div>
    );
}

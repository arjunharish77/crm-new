"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SelectionAction = {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    destructive?: boolean;
    disabled?: boolean;
};

// Appears when rows are selected (UI/UX plan §11.6 F): "N selected · Select all M matching",
// verb actions, destructive actions last. Sits below the dialog layer (z-40, B9) so any
// confirmation it opens is on top. Pass `totalMatching` and `onSelectAllMatching` to offer
// selecting every row the filters match, not only the visible page.
export function SelectionBar({ count, totalMatching, allMatchingSelected, onSelectAllMatching, onClear, actions, className }: {
    count: number;
    totalMatching?: number;
    allMatchingSelected?: boolean;
    onSelectAllMatching?: () => void;
    onClear: () => void;
    actions: SelectionAction[];
    className?: string;
}) {
    if (count <= 0) return null;
    const ordered = [...actions.filter((action) => !action.destructive), ...actions.filter((action) => action.destructive)];
    const canSelectAll = !allMatchingSelected && onSelectAllMatching && totalMatching !== undefined && totalMatching > count;
    return (
        <div role="region" aria-label="Selection actions" className={cn("fixed bottom-4 left-1/2 z-40 w-max max-w-[calc(100vw-32px)] -translate-x-1/2", className)}>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-dialog">
                <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}><X className="size-4" /></Button>
                <span className="whitespace-nowrap text-sm font-medium tabular-nums" aria-live="polite">
                    {(allMatchingSelected && totalMatching ? totalMatching : count).toLocaleString()} selected
                </span>
                {canSelectAll ? (
                    <Button variant="link" size="sm" className="h-8 px-1" onClick={onSelectAllMatching}>
                        Select all {totalMatching!.toLocaleString()} matching
                    </Button>
                ) : null}
                <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                {ordered.map((action, index) => (
                    <React.Fragment key={action.label}>
                        {action.destructive && index > 0 && !ordered[index - 1].destructive ? <span aria-hidden className="mx-0.5 h-5 w-px bg-border" /> : null}
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.disabled}
                            onClick={action.onClick}
                            className={cn(action.destructive && "text-destructive hover:bg-status-danger hover:text-status-danger-foreground")}
                        >
                            {action.icon}
                            {action.label}
                        </Button>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { StageDefinition } from "@/types/opportunities";
import { cn } from "@/lib/utils";

// The opportunity's stage path (UI/UX plan §11.4): the open stages as one row of steps, with Won
// and Lost kept apart at the end, since closing asks for a reason. Each step is a button, so
// moving stage works from the keyboard; the current step carries aria-current.
export function StagePath({ stages, currentStageId, onSelect, disabled }: {
    stages: StageDefinition[];
    currentStageId: string | null | undefined;
    onSelect: (stage: StageDefinition) => void;
    disabled?: boolean;
}) {
    const ordered = [...stages].sort((a, b) => a.order - b.order);
    const open = ordered.filter((stage) => !stage.isClosed);
    const closed = ordered.filter((stage) => stage.isClosed);
    const current = ordered.find((stage) => stage.id === currentStageId);
    const listRef = useRef<HTMLOListElement>(null);
    // On a narrow screen the path scrolls sideways; keep the current step in view.
    useEffect(() => {
        const list = listRef.current;
        const step = list?.querySelector<HTMLElement>('[aria-current="step"]');
        if (list && step) list.scrollLeft = Math.max(0, step.offsetLeft - (list.clientWidth - step.offsetWidth) / 2);
    }, [currentStageId]);
    const currentIndex = current && !current.isClosed ? open.findIndex((stage) => stage.id === current.id) : current?.isWon ? open.length : -1;

    return (
        <nav aria-label="Stage" className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <ol ref={listRef} className="relative flex min-w-0 flex-1 overflow-x-auto rounded-lg border [scrollbar-width:thin]">
                {open.map((stage, index) => {
                    const isCurrent = stage.id === currentStageId;
                    const done = index < currentIndex;
                    return (
                        <li key={stage.id} className="min-w-28 flex-1 border-r last:border-r-0">
                            <button
                                type="button"
                                disabled={disabled || isCurrent}
                                aria-current={isCurrent ? "step" : undefined}
                                onClick={() => onSelect(stage)}
                                className={cn(
                                    "flex h-9 w-full items-center justify-center gap-1.5 truncate px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default",
                                    isCurrent ? "bg-primary font-medium text-primary-foreground" : done ? "bg-selected text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {done ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                                <span className="truncate">{stage.label || stage.name}</span>
                                {done ? <span className="sr-only">(done)</span> : null}
                            </button>
                        </li>
                    );
                })}
            </ol>
            {closed.length ? (
                <div className="flex shrink-0 gap-1.5">
                    {closed.map((stage) => {
                        const isCurrent = stage.id === currentStageId;
                        return (
                            <button
                                key={stage.id}
                                type="button"
                                disabled={disabled || isCurrent}
                                aria-current={isCurrent ? "step" : undefined}
                                onClick={() => onSelect(stage)}
                                className={cn(
                                    "h-9 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                                    isCurrent
                                        ? stage.isWon ? "border-transparent bg-status-success text-status-success-foreground font-medium" : "border-transparent bg-status-danger text-status-danger-foreground font-medium"
                                        : "border-border-strong text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {isCurrent ? stage.label || stage.name : `Mark as ${stage.label || stage.name}`}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </nav>
    );
}

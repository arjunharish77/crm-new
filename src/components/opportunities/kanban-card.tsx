"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Opportunity } from "@/types/opportunities";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/display/format";
import { statusDisplay } from "@/lib/display/status";
import Link from "next/link";
import { formatWorkspaceDate, isPastDate } from "@/lib/date-format";

interface KanbanCardProps {
    opportunity: Opportunity;
    isDragging?: boolean;
    onEdit?: (opportunity: Opportunity) => void;
}

export function KanbanCard({ opportunity, isDragging: isOverlay, onEdit }: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: opportunity.id,
        data: {
            type: "dnd-card",
            item: opportunity,
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    const closeOverdue = isPastDate(opportunity.expectedCloseDate) && !opportunity.stage?.isClosed;
    const priority = opportunity.priority ? statusDisplay("priority", opportunity.priority) : null;

    // Board card (UI/UX plan §11.4): title, lead, value, close date, owner. The whole card is the
    // drag handle; with the keyboard, focus it and press Space to pick it up.
    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            aria-label={`${opportunity.title}. Press Space to move it to another stage.`}
            className="cursor-grab touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
            <div className={cn("group relative rounded-lg border bg-card p-3 transition-colors hover:border-border-strong", isOverlay && "shadow-menu")}>
                <div className="flex items-start justify-between gap-2">
                    <Link
                        href={`/dashboard/opportunities/${opportunity.id}`}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="min-w-0 text-sm font-medium leading-snug text-foreground hover:underline"
                    >
                        {opportunity.title}
                    </Link>
                    {onEdit && (
                        <button
                            type="button"
                            aria-label={`Edit ${opportunity.title}`}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(opportunity); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Pencil className="size-3.5" />
                        </button>
                    )}
                </div>
                {opportunity.lead?.name ? <p className="truncate text-xs text-muted-foreground">{opportunity.lead.name}</p> : null}
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums">{formatMoney(opportunity.amount || 0)}</span>
                    {opportunity.expectedCloseDate ? (
                        <span className={cn("text-xs", closeOverdue ? "text-destructive" : "text-muted-foreground")}>
                            {closeOverdue ? "Overdue · " : ""}{formatWorkspaceDate(opportunity.expectedCloseDate)}
                        </span>
                    ) : null}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{opportunity.ownerName ?? "Unassigned"}</span>
                    {priority && opportunity.priority !== "LOW" ? <span className={cn(priority.tone === "danger" && "text-destructive")}>{priority.label}</span> : null}
                </div>
            </div>
        </div>
    );
}

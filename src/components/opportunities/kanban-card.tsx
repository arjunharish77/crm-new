"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Opportunity } from "@/types/opportunities";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { formatWorkspaceDate } from "@/lib/date-format";

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

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'HIGH': return "var(--destructive)";
            case 'MEDIUM': return "var(--tertiary)";
            default: return "var(--muted-foreground)";
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none active:cursor-grabbing"
        >
            <div
                className={cn(
                    "group relative rounded-xl border border-border bg-background p-3 transition-all hover:border-primary hover:shadow-sm",
                    isOverlay && "shadow-md"
                )}
            >
                <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                        <Link
                            href={`/dashboard/opportunities/${opportunity.id}`}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="text-sm font-bold leading-snug text-foreground hover:text-primary hover:underline"
                        >
                            {opportunity.title}
                        </Link>

                        <div className="flex shrink-0 items-center gap-1">
                            {onEdit && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onEdit(opportunity);
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/10 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <Pencil className="size-3.5" />
                                </button>
                            )}

                            {opportunity.priority && (
                                <span
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: getPriorityColor(opportunity.priority) }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-primary">
                            {formatCurrency(opportunity.amount || 0)}
                        </span>
                        {opportunity.expectedCloseDate && (
                            <span className="text-xs font-medium text-muted-foreground">
                                {formatWorkspaceDate(opportunity.expectedCloseDate)}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                        {opportunity.opportunityType && (
                            <Badge
                                variant="outline"
                                className="h-5 border-transparent text-[0.65rem] font-bold"
                                style={{
                                    backgroundColor: opportunity.opportunityType.color
                                        ? `${opportunity.opportunityType.color}1a`
                                        : "var(--primary-container)",
                                    color: opportunity.opportunityType.color || "var(--primary)",
                                }}
                            >
                                {opportunity.opportunityType.name}
                            </Badge>
                        )}
                        {opportunity.tags?.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="outline" className="h-5 text-[0.65rem] font-medium text-muted-foreground">
                                {tag}
                            </Badge>
                        ))}
                        {opportunity.tags && opportunity.tags.length > 2 && (
                            <span className="text-[0.65rem] text-muted-foreground">
                                +{opportunity.tags.length - 2}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

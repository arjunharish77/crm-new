
"use client";

import React, { useMemo } from "react";
import {
    DndContext,
    DragOverlay,
    useDraggable,
    useDroppable,
    DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Opportunity, StageDefinition } from "@/types/opportunities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@mui/material";

interface KanbanBoardProps {
    stages: StageDefinition[];
    opportunities: Opportunity[];
    onDragEnd: (event: DragEndEvent) => void;
}

export function KanbanBoard({ stages, opportunities, onDragEnd }: KanbanBoardProps) {
    const [activeId, setActiveId] = React.useState<string | null>(null);

    const activeOpportunity = useMemo(
        () => opportunities.find((o) => o.id === activeId),
        [activeId, opportunities]
    );

    return (
        <DndContext onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={onDragEnd}>
            <div className="flex h-full gap-4 overflow-x-auto p-4">
                {stages.map((stage) => (
                    <KanbanColumn
                        key={stage.id}
                        stage={stage}
                        opportunities={opportunities.filter((o) => o.stageId === stage.id)}
                    />
                ))}
            </div>
            <DragOverlay>
                {activeOpportunity ? <OpportunityCard opportunity={activeOpportunity} /> : null}
            </DragOverlay>
        </DndContext>
    );
}

function KanbanColumn({ stage, opportunities }: { stage: StageDefinition; opportunities: Opportunity[] }) {
    const { setNodeRef } = useDroppable({
        id: stage.id,
    });

    return (
        <div ref={setNodeRef} className="flex h-full w-80 flex-col rounded-md bg-muted/50 p-2">
            <div className="mb-2 flex items-center justify-between p-2">
                <h3 className="font-semibold">{stage.label || stage.name}</h3>
                <Chip label={opportunities.length} size="small" variant="filled" color="default" />
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {opportunities.map((opp) => (
                    <DraggableOpportunityCard key={opp.id} opportunity={opp} />
                ))}
            </div>
        </div>
    );
}

function DraggableOpportunityCard({ opportunity }: { opportunity: Opportunity }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: opportunity.id,
    });

    const style = transform
        ? {
            transform: CSS.Translate.toString(transform),
        }
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            <OpportunityCard opportunity={opportunity} />
        </div>
    );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
    return (
        <div className="cursor-grab active:cursor-grabbing">
            <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="p-3 pb-1">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-sm font-medium leading-none">
                            <a href={`/dashboard/opportunities/${opportunity.id}`} className="hover:underline focus:outline-none">
                                {opportunity.title}
                            </a>
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                    <div className="text-xs text-muted-foreground mb-2">
                        Value: ${(opportunity.amount || 0).toLocaleString()}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

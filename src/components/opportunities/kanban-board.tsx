"use client";

import React, { useMemo, useState } from "react";
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    MouseSensor,
    TouchSensor,
    DragStartEvent,
    DragEndEvent,
    defaultDropAnimationSideEffects,
    DropAnimation,
    useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { Opportunity, OpportunityType, StageDefinition } from "@/types/opportunities";
import { KanbanCard } from "./kanban-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface KanbanBoardProps {
    /** The OpportunityType whose stages define the kanban columns */
    opportunityType: OpportunityType;
    opportunities: Opportunity[];
    onDragEnd: (opportunityId: string, newStageId: string) => void;
    onEdit?: (opportunity: Opportunity) => void;
}

export function KanbanBoard({ opportunityType, opportunities, onDragEnd, onEdit }: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 10 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        })
    );

    const columns = useMemo(() => {
        if (!opportunityType?.stages) return [];
        return opportunityType.stages.map((stage: StageDefinition) => ({
            ...stage,
            items: opportunities.filter((opp) => opp.stageId === stage.id),
        }));
    }, [opportunityType, opportunities]);

    const activeOpportunity = useMemo(
        () => opportunities.find((opp) => opp.id === activeId),
        [activeId, opportunities]
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const overStageId = String(over.id);
            const isOverStage = (opportunityType?.stages || []).some((s: StageDefinition) => s.id === overStageId);

            if (isOverStage) {
                onDragEnd(active.id as string, overStageId);
            } else {
                const overOpportunity = opportunities.find(o => o.id === over.id);
                if (overOpportunity && overOpportunity.stageId) {
                    onDragEnd(active.id as string, overOpportunity.stageId);
                }
            }
        }
        setActiveId(null);
    };

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
        }),
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full gap-2.5 overflow-x-auto px-0.5 pb-1.5">
                {columns.map((col) => (
                    <KanbanColumn key={col.id} stage={col} items={col.items} onEdit={onEdit} />
                ))}
            </div>

            {typeof window !== 'undefined' && createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeOpportunity ? (
                        <div className="w-[292px]">
                            <KanbanCard opportunity={activeOpportunity} isDragging onEdit={onEdit} />
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

function KanbanColumn({ stage, items, onEdit }: { stage: StageDefinition; items: Opportunity[]; onEdit?: (opp: Opportunity) => void }) {
    const { setNodeRef } = useDroppable({
        id: stage.id,
    });

    const totalValue = items.reduce((sum, item) => sum + (item.amount || 0), 0);

    return (
        <div
            ref={setNodeRef}
            className="flex max-h-full w-[292px] min-w-[292px] flex-col overflow-hidden rounded-xl border border-border bg-surface-container-low"
        >
            <div className="border-b border-border bg-background px-3 py-2.5">
                <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: stage.color || "var(--primary)" }} />
                        <span className="text-sm font-bold">{stage.label || stage.name}</span>
                    </div>
                    <Badge variant="secondary" className="h-5 rounded-md text-[0.7rem] font-bold">
                        {items.length}
                    </Badge>
                </div>
                <p className="text-xs font-semibold text-primary">{formatCurrency(totalValue, undefined, { notation: "compact", maximumFractionDigits: 1 })}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5">
                <SortableContext
                    items={items.map(i => i.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="flex flex-col gap-2">
                        {items.map((opp) => (
                            <KanbanCard key={opp.id} opportunity={opp} onEdit={onEdit} />
                        ))}
                    </div>
                </SortableContext>
            </div>
        </div>
    );
}

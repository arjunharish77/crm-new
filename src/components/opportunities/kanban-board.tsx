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
import {
    Box,
    Typography,
    useTheme,
    alpha,
    Stack,
    Chip
} from "@mui/material";

interface KanbanBoardProps {
    /** The OpportunityType whose stages define the kanban columns */
    opportunityType: OpportunityType;
    opportunities: Opportunity[];
    onDragEnd: (opportunityId: string, newStageId: string) => void;
    onEdit?: (opportunity: Opportunity) => void;
}

export function KanbanBoard({ opportunityType, opportunities, onDragEnd, onEdit }: KanbanBoardProps) {
    const theme = useTheme();
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
            <Box sx={{
                display: 'flex',
                gap: 2.5,
                px: 2.5,
                pb: 2.5,
                overflowX: 'auto',
                height: '100%',
                bgcolor: alpha(theme.palette.background.default, 0.5)
            }}>
                {columns.map((col) => (
                    <KanbanColumn key={col.id} stage={col} items={col.items} onEdit={onEdit} />
                ))}
            </Box>

            {typeof window !== 'undefined' && createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeOpportunity ? (
                        <Box sx={{ width: 300 }}>
                            <KanbanCard opportunity={activeOpportunity} isDragging onEdit={onEdit} />
                        </Box>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

function KanbanColumn({ stage, items, onEdit }: { stage: StageDefinition; items: Opportunity[]; onEdit?: (opp: Opportunity) => void }) {
    const theme = useTheme();
    const { setNodeRef } = useDroppable({
        id: stage.id,
    });

    const totalValue = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1
    });

    return (
        <Box
            ref={setNodeRef}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: 300,
                minWidth: 300,
                maxHeight: '100%',
                bgcolor: 'action.hover',
                borderRadius: 4,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden'
            }}
        >
            <Box sx={{ p: 2, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: stage.color || 'primary.main' }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {stage.label || stage.name}
                        </Typography>
                    </Stack>
                    <Chip
                        label={items.length}
                        size="small"
                        sx={{
                            height: 20,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            bgcolor: 'action.selected'
                        }}
                    />
                </Stack>
                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                    {formatter.format(totalValue)}
                </Typography>
            </Box>

            <Box sx={{ flexGrow: 1, p: 1.5, overflowY: 'auto' }}>
                <SortableContext
                    items={items.map(i => i.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <Stack spacing={1.5}>
                        {items.map((opp) => (
                            <KanbanCard key={opp.id} opportunity={opp} onEdit={onEdit} />
                        ))}
                    </Stack>
                </SortableContext>
            </Box>
        </Box>
    );
}

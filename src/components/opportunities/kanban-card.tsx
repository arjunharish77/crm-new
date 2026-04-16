"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Opportunity } from "@/types/opportunities";
import {
    Card,
    CardContent,
    Typography,
    Box,
    Chip,
    Stack,
    alpha,
    useTheme,
    Link as MuiLink,
    IconButton
} from "@mui/material";
import { Edit as EditIcon } from "@mui/icons-material";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

interface KanbanCardProps {
    opportunity: Opportunity;
    isDragging?: boolean;
    onEdit?: (opportunity: Opportunity) => void;
}

export function KanbanCard({ opportunity, isDragging: isOverlay, onEdit }: KanbanCardProps) {
    const theme = useTheme();
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
            case 'HIGH': return theme.palette.error.main;
            case 'MEDIUM': return theme.palette.warning.main;
            default: return theme.palette.text.secondary;
        }
    };

    return (
        <Box
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            sx={{
                touchAction: 'none',
                cursor: 'grab',
                '&:active': { cursor: 'grabbing' }
            }}
        >
            <Card
                sx={{
                    position: 'relative',
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: isOverlay ? theme.shadows[4] : 'none',
                    bgcolor: 'background.paper',
                    '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: 1,
                        '& .edit-button': { opacity: 1 }
                    },
                    transition: 'all 0.2s ease-in-out'
                }}
            >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Stack spacing={1.5}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                            <Link
                                href={`/dashboard/opportunities/${opportunity.id}`}
                                passHref
                                style={{ textDecoration: 'none' }}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontWeight: 700,
                                        color: 'text.primary',
                                        lineHeight: 1.3,
                                        '&:hover': { color: 'primary.main', textDecoration: 'underline' }
                                    }}
                                >
                                    {opportunity.title}
                                </Typography>
                            </Link>

                            <Stack direction="row" spacing={0.5} alignItems="center">
                                {onEdit && (
                                    <IconButton
                                        className="edit-button"
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            onEdit(opportunity);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        sx={{
                                            opacity: 0,
                                            transition: 'opacity 0.2s',
                                            width: 24,
                                            height: 24,
                                            padding: 0.5,
                                            color: 'text.secondary',
                                            '&:hover': { color: 'primary.main', bgcolor: 'primary.lighter' }
                                        }}
                                    >
                                        <EditIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                )}

                                {opportunity.priority && (
                                    <Box
                                        sx={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: '50%',
                                            bgcolor: getPriorityColor(opportunity.priority),
                                            flexShrink: 0
                                        }}
                                    />
                                )}
                            </Stack>
                        </Box>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                {formatCurrency(opportunity.amount || 0)}
                            </Typography>
                            {opportunity.expectedCloseDate && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                    {new Date(opportunity.expectedCloseDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </Typography>
                            )}
                        </Stack>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {opportunity.opportunityType && (
                                <Chip
                                    label={opportunity.opportunityType.name}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        bgcolor: alpha(opportunity.opportunityType.color || theme.palette.primary.main, 0.1),
                                        color: opportunity.opportunityType.color || theme.palette.primary.main,
                                        border: 'none'
                                    }}
                                />
                            )}
                            {opportunity.tags?.slice(0, 2).map(tag => (
                                <Chip
                                    key={tag}
                                    label={tag}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.65rem',
                                        fontWeight: 500,
                                        borderColor: 'divider',
                                        color: 'text.secondary'
                                    }}
                                />
                            ))}
                            {opportunity.tags && opportunity.tags.length > 2 && (
                                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.2 }}>
                                    +{opportunity.tags.length - 2}
                                </Typography>
                            )}
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
}

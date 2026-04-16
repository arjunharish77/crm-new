"use client";

import { Activity } from "@/types/activities";
import { Box, Chip, Typography, alpha, Paper, Stack } from "@mui/material";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface ActivitiesMobileListProps {
    data: Activity[];
}

export function ActivitiesMobileList({ data }: ActivitiesMobileListProps) {
    if (data.length === 0) {
        return (
            <Paper
                elevation={0}
                sx={{
                    p: 4,
                    textAlign: 'center',
                    borderRadius: '16px',
                    bgcolor: 'action.hover',
                    border: '1px dashed',
                    borderColor: 'divider'
                }}
            >
                <Typography variant="body2" color="text.secondary">
                    No activities found.
                </Typography>
            </Paper>
        );
    }

    return (
        <Stack spacing={2} sx={{ display: { md: 'none' } }}>
            {data.map((activity) => (
                <Paper
                    key={activity.id}
                    elevation={0}
                    sx={{
                        p: 2,
                        borderRadius: '16px',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        '&:hover': { bgcolor: 'action.hover' }
                    }}
                >
                    <Stack spacing={1.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Box sx={{ flex: 1 }}>
                                {activity.type && (
                                    <Chip
                                        label={activity.type.name}
                                        size="small"
                                        sx={{
                                            mb: 1,
                                            fontWeight: 700,
                                            fontSize: '0.625rem',
                                            textTransform: 'uppercase',
                                            borderRadius: '6px',
                                            bgcolor: activity.type.color ? alpha(activity.type.color, 0.08) : 'action.hover',
                                            color: activity.type.color || 'text.secondary',
                                            border: '1px solid',
                                            borderColor: activity.type.color ? alpha(activity.type.color, 0.2) : 'divider'
                                        }}
                                    />
                                )}
                                <Typography variant="body2" sx={{ fontWeight: 600, lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {activity.notes}
                                </Typography>
                            </Box>
                            {activity.outcome && (
                                <Chip
                                    label={activity.outcome}
                                    size="small"
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: '0.625rem',
                                        borderRadius: '4px',
                                        bgcolor: 'surfaceContainerHighest',
                                        color: 'text.secondary'
                                    }}
                                />
                            )}
                        </Stack>

                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 600, color: activity.completedAt ? 'success.main' : activity.dueAt ? 'warning.main' : 'text.secondary' }}>
                                {activity.completedAt ? (
                                    `✓ Completed ${formatDistanceToNow(new Date(activity.completedAt), { addSuffix: true })}`
                                ) : activity.dueAt ? (
                                    `Due ${formatDistanceToNow(new Date(activity.dueAt), { addSuffix: true })}`
                                ) : (
                                    `Logged ${formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}`
                                )}
                            </Typography>
                        </Box>

                        {(activity.lead || activity.opportunity) && (
                            <Stack direction="row" spacing={1} sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                                {activity.lead && (
                                    <Box
                                        component={Link}
                                        href={`/dashboard/leads/${activity.lead.id}`}
                                        sx={{
                                            fontSize: '0.7rem',
                                            color: 'primary.main',
                                            textDecoration: 'none',
                                            fontWeight: 700,
                                            '&:hover': { textDecoration: 'underline' }
                                        }}
                                    >
                                        Lead: {activity.lead.name}
                                    </Box>
                                )}
                                {activity.opportunity && (
                                    <Box
                                        component={Link}
                                        href={`/dashboard/opportunities/${activity.opportunity.id}`}
                                        sx={{
                                            fontSize: '0.7rem',
                                            color: 'secondary.main',
                                            textDecoration: 'none',
                                            fontWeight: 700,
                                            '&:hover': { textDecoration: 'underline' }
                                        }}
                                    >
                                        Opp: {activity.opportunity.title}
                                    </Box>
                                )}
                            </Stack>
                        )}
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}

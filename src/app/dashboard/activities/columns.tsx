"use client";

import React from "react";
import { GridColDef } from "@mui/x-data-grid";
import { Activity } from "@/types/activities";
import { Box, Chip, Typography, alpha, Stack, Avatar } from "@mui/material";
import { formatDistanceToNow, format } from "date-fns";
import Link from "next/link";

export const columns: GridColDef[] = [
    {
        field: 'type',
        headerName: 'Type',
        width: 140,
        renderCell: (params) => {
            const type = params.value as any;
            if (!type) return <Typography variant="caption" color="text.secondary">-</Typography>;
            return (
                <Chip
                    label={type.name}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        borderRadius: '6px',
                        bgcolor: type.color ? alpha(type.color, 0.08) : 'action.hover',
                        color: type.color || 'text.secondary',
                        border: '1px solid',
                        borderColor: type.color ? alpha(type.color, 0.2) : 'divider'
                    }}
                />
            );
        }
    },
    {
        field: 'notes',
        headerName: 'Description',
        flex: 1,
        minWidth: 250,
        renderCell: (params) => (
            <Typography
                variant="body2"
                sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500
                }}
                title={params.value as string}
            >
                {params.value}
            </Typography>
        )
    },
    {
        field: 'outcome',
        headerName: 'Outcome',
        width: 140,
        renderCell: (params) => {
            const outcome = params.value as string;
            if (!outcome) return <Typography variant="caption" color="text.secondary">-</Typography>;
            return (
                <Chip
                    label={outcome}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.625rem',
                        textTransform: 'uppercase',
                        borderRadius: '6px',
                        bgcolor: 'surfaceContainerHighest',
                        color: 'text.secondary',
                        border: '1px solid',
                        borderColor: 'divider'
                    }}
                />
            );
        }
    },
    {
        field: 'date',
        headerName: 'Time',
        width: 170,
        valueGetter: (params, row: Activity) => {
            return row.completedAt || row.dueAt || row.createdAt;
        },
        renderCell: (params) => {
            const date = new Date(params.value as string);
            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 44 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {format(date, 'MMM d, h:mm a')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {formatDistanceToNow(date, { addSuffix: true })}
                    </Typography>
                </Box>
            );
        }
    },
    {
        field: 'related',
        headerName: 'Related To',
        width: 200,
        renderCell: (params) => {
            const row = params.row as Activity;
            if (!row.lead && !row.opportunity) return <Typography variant="caption" color="text.secondary">-</Typography>;

            return (
                <Stack direction="row" spacing={1} alignItems="center">
                    {row.lead && (
                        <Box
                            component={Link}
                            href={`/dashboard/leads/${row.lead.id}`}
                            sx={{
                                fontSize: '0.75rem',
                                color: 'primary.main',
                                textDecoration: 'none',
                                fontWeight: 700,
                                '&:hover': { textDecoration: 'underline' }
                            }}
                        >
                            {row.lead.name} (Lead)
                        </Box>
                    )}
                    {row.opportunity && (
                        <Box
                            component={Link}
                            href={`/dashboard/opportunities/${row.opportunity.id}`}
                            sx={{
                                fontSize: '0.75rem',
                                color: 'secondary.main',
                                textDecoration: 'none',
                                fontWeight: 700,
                                '&:hover': { textDecoration: 'underline' }
                            }}
                        >
                            | {row.opportunity.title} (Opp)
                        </Box>
                    )}
                </Stack>
            );
        }
    }
];

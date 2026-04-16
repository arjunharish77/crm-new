'use client';

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Stack,
    CircularProgress,
    Paper,
    alpha,
    Divider,
    Chip
} from '@mui/material';
import {
    History as HistoryIcon,
    FiberManualRecord as DotIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface HistoryItem {
    id: string;
    action: string;
    createdAt: string;
    user: { name: string; email: string };
    changes: {
        before: any;
        after: any;
        diff: any;
    };
}

interface RecordHistoryProps {
    entityType: string;
    entityId: string;
}

export function RecordHistory({ entityType, entityId }: RecordHistoryProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (entityId) {
            apiFetch(`/governance/history/${entityType}/${entityId}`)
                .then(setHistory)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [entityType, entityId]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>;

    if (history.length === 0) return (
        <Box sx={{ p: 4, textAlign: 'center', opacity: 0.6 }}>
            <HistoryIcon sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="body2">No history records found for this {entityType.toLowerCase()}.</Typography>
        </Box>
    );

    return (
        <Stack spacing={0} sx={{ p: 1 }}>
            {history.map((item, idx) => (
                <Box key={item.id} sx={{ position: 'relative', pb: 3, pl: 3 }}>
                    {/* Vertical Line */}
                    {idx < history.length - 1 && (
                        <Box
                            sx={{
                                position: 'absolute',
                                left: 11,
                                top: 24,
                                bottom: 0,
                                width: 2,
                                bgcolor: 'divider'
                            }}
                        />
                    )}

                    {/* Dot */}
                    <Box
                        sx={{
                            position: 'absolute',
                            left: 0,
                            top: 4,
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1
                        }}
                    >
                        <DotIcon sx={{ fontSize: 12, color: 'primary.main' }} />
                    </Box>

                    {/* Content */}
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 2,
                            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.5),
                            borderColor: (theme) => alpha(theme.palette.divider, 0.1)
                        }}
                    >
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                            <Typography variant="subtitle2" component="span">
                                {item.action === 'CREATE' ? 'Created' : item.action === 'UPDATE' ? 'Updated' : item.action}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </Typography>
                        </Box>

                        <Typography variant="caption" display="block" color="text.secondary" gutterBottom>
                            by {item.user.name} ({item.user.email})
                        </Typography>

                        {item.action === 'UPDATE' && item.changes.diff && (
                            <Box sx={{ mt: 1 }}>
                                <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                                    {Object.keys(item.changes.diff).map(key => (
                                        <Chip key={key} label={key} size="small" variant="outlined" sx={{ fontSize: '0.625rem', height: 18 }} />
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Paper>
                </Box>
            ))}
        </Stack>
    );
}

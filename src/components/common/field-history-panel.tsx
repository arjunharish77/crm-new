'use client';

import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Stack,
    Tooltip,
    CircularProgress,
    Chip,
    alpha,
    useTheme,
} from '@mui/material';
import {
    History as HistoryIcon,
    ArrowForward as ArrowIcon,
    Person as PersonIcon,
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface AuditEntry {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    before: Record<string, any> | null;
    after: Record<string, any> | null;
    diff: Record<string, any> | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
    };
}

interface FieldHistoryPanelProps {
    entityType: string;
    entityId: string;
}

const ACTION_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary'> = {
    LEAD_CREATED: 'success',
    LEAD_UPDATED: 'info',
    LEAD_DELETED: 'error',
    OPPORTUNITY_CREATED: 'success',
    OPPORTUNITY_UPDATED: 'info',
    STAGE_CHANGED: 'warning',
    DEFAULT: 'default',
};

function formatValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (Array.isArray(val)) return val.join(', ') || '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

function ChangedFields({ before, after }: { before: any; after: any }) {
    if (!before && !after) return null;

    const allKeys = new Set([
        ...Object.keys(before || {}),
        ...Object.keys(after || {}),
    ]);

    // Filter out internal/metadata fields
    const skipKeys = new Set(['tenantId', 'updatedAt', 'createdAt', 'deletedAt', 'deletedBy', 'hash']);
    const changedKeys = [...allKeys].filter(k => {
        if (skipKeys.has(k)) return false;
        return JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k]);
    });

    if (changedKeys.length === 0) return null;

    return (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {changedKeys.slice(0, 5).map(key => (
                <Stack key={key} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="caption" fontWeight={600} sx={{ minWidth: 80, color: 'text.secondary' }}>
                        {key}
                    </Typography>
                    <Typography variant="caption" sx={{
                        bgcolor: 'error.main',
                        color: 'error.contrastText',
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        textDecoration: 'line-through',
                        opacity: 0.8,
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {formatValue((before || {})[key])}
                    </Typography>
                    <ArrowIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                    <Typography variant="caption" sx={{
                        bgcolor: 'success.main',
                        color: 'success.contrastText',
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 1,
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {formatValue((after || {})[key])}
                    </Typography>
                </Stack>
            ))}
            {changedKeys.length > 5 && (
                <Typography variant="caption" color="text.disabled">
                    +{changedKeys.length - 5} more fields changed
                </Typography>
            )}
        </Box>
    );
}

export function FieldHistoryPanel({ entityType, entityId }: FieldHistoryPanelProps) {
    const theme = useTheme();
    const [history, setHistory] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!entityId) return;
        apiFetch<any>(
            `/audit-logs?entityType=${entityType.toUpperCase()}&entityId=${entityId}&limit=30`
        )
            .then(data => {
                // Filter entries for this specific entity
                const entries: AuditEntry[] = (data?.data || []).filter(
                    (e: AuditEntry) => e.entityId === entityId
                );
                setHistory(entries);
            })
            .catch(() => toast.error('Failed to load field history'))
            .finally(() => setLoading(false));
    }, [entityId, entityType]);

    return (
        <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <HistoryIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                <Typography variant="subtitle1" fontWeight={700}>
                    Field History
                </Typography>
                {history.length > 0 && (
                    <Chip
                        label={history.length}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'action.selected' }}
                    />
                )}
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : history.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
                    <HistoryIcon sx={{ fontSize: 32, mb: 1 }} />
                    <Typography variant="body2">No history recorded yet.</Typography>
                </Box>
            ) : (
                <Box sx={{ position: 'relative' }}>
                    {/* Vertical timeline line */}
                    <Box sx={{
                        position: 'absolute',
                        left: 11,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        bgcolor: 'divider',
                        zIndex: 0,
                    }} />

                    <Stack spacing={2}>
                        {history.map((entry, idx) => {
                            const color = ACTION_COLORS[entry.action] || 'default';
                            return (
                                <Box key={entry.id} sx={{ display: 'flex', gap: 2, position: 'relative', zIndex: 1 }}>
                                    {/* Dot */}
                                    <Box sx={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        bgcolor: `${color}.main`,
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '2px solid',
                                        borderColor: 'background.paper',
                                        boxShadow: `0 0 0 2px ${color === 'default' ? theme.palette.grey[400] : alpha((theme.palette[color as keyof typeof theme.palette] as any).main, 0.2)}`,
                                    }}>
                                        <PersonIcon sx={{ fontSize: 12, color: 'white' }} />
                                    </Box>

                                    {/* Content */}
                                    <Box sx={{ flex: 1, pb: 2 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                            <Chip
                                                label={entry.action.replace(/_/g, ' ')}
                                                size="small"
                                                color={color}
                                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                                            />
                                            <Typography variant="caption" fontWeight={600}>
                                                {entry.user.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.disabled">
                                                {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                                            </Typography>
                                        </Stack>

                                        {entry.before && entry.after && (
                                            <ChangedFields before={entry.before} after={entry.after} />
                                        )}

                                        {entry.diff && !entry.before && (
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                {JSON.stringify(entry.diff).slice(0, 120)}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}

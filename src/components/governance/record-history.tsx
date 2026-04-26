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
    Chip,
    Autocomplete,
    TextField
} from '@mui/material';
import {
    History as HistoryIcon,
    FiberManualRecord as DotIcon,
    ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { apiFetch } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface HistoryItem {
    id: string;
    action: string;
    createdAt: string;
    user: { name: string; email: string };
    valueLabels?: {
        stages?: Record<string, string>;
        opportunityTypes?: Record<string, string>;
        activityTypes?: Record<string, string>;
    };
    changes: {
        before: any;
        after: any;
        diff: any;
    };
}

const SKIP_FIELDS = new Set(['tenantId', 'objectId', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'hash']);

function labelForField(field: string) {
    return field
        .replace(/Id$/, "")
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (value) => value.toUpperCase());
}

function humanizeToken(value: string) {
    return value
        .replace(/^stage_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: any, field?: string, item?: HistoryItem) {
    if (value === null || value === undefined || value === "") return "Empty";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "Empty";
    if (typeof value === "object") return JSON.stringify(value);
    const stringValue = String(value);
    if (field === "stageId") return item?.valueLabels?.stages?.[stringValue] || humanizeToken(stringValue);
    if (field === "opportunityTypeId") return item?.valueLabels?.opportunityTypes?.[stringValue] || humanizeToken(stringValue);
    if (field === "typeId") return item?.valueLabels?.activityTypes?.[stringValue] || humanizeToken(stringValue);
    if (["status", "source", "priority", "outcome", "slaStatus"].includes(field || "")) return humanizeToken(stringValue);
    return stringValue;
}

function changedFields(item: HistoryItem) {
    if (item.changes.diff && typeof item.changes.diff === "object") {
        return Object.entries(item.changes.diff)
            .filter(([key]) => !SKIP_FIELDS.has(key))
            .map(([field, value]: any) => ({
                field,
                before: value?.before,
                after: value?.after,
            }));
    }

    const before = item.changes.before ?? {};
    const after = item.changes.after ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
        .filter((key) => !SKIP_FIELDS.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
        .map((field) => ({ field, before: before[field], after: after[field] }));
}

interface RecordHistoryProps {
    entityType: string;
    entityId: string;
}

export function RecordHistory({ entityType, entityId }: RecordHistoryProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [fieldFilter, setFieldFilter] = useState<string[]>([]);

    useEffect(() => {
        if (entityId) {
            apiFetch(`/governance/history/${entityType}/${entityId}`)
                .then(setHistory)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [entityType, entityId]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>;

    const availableFields = [...new Set(history.flatMap((item) => changedFields(item).map((field) => field.field)))];
    const filteredHistory = fieldFilter.length === 0
        ? history
        : history
            .map((item) => ({
                ...item,
                __filteredFields: changedFields(item).filter((field) => fieldFilter.includes(field.field)),
            }))
            .filter((item: any) => item.action !== "UPDATE" || item.__filteredFields.length > 0);

    if (history.length === 0) return (
        <Box sx={{ p: 4, textAlign: 'center', opacity: 0.6 }}>
            <HistoryIcon sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="body2">No history records found for this {entityType.toLowerCase()}.</Typography>
        </Box>
    );

    return (
        <Stack spacing={1.25} sx={{ p: 0.5 }}>
            {availableFields.length > 0 && (
                <Autocomplete
                    multiple
                    size="small"
                    options={availableFields}
                    value={fieldFilter}
                    onChange={(_, value) => setFieldFilter(value)}
                    getOptionLabel={(option) => labelForField(option)}
                    filterSelectedOptions
                    renderTags={(value, getTagProps) => {
                        const { key, ...tagProps } = getTagProps({ index: 0 });
                        return value.length > 0 ? (
                            <Chip
                                key={key}
                                label={`${value.length} selected`}
                                size="small"
                                {...tagProps}
                            />
                        ) : null;
                    }}
                    sx={{
                        width: { xs: "100%", sm: 320 },
                        px: 0.5,
                        pb: 0.5,
                        "& .MuiInputBase-root": {
                            minHeight: 34,
                            borderRadius: "10px",
                            bgcolor: "background.paper",
                            fontSize: "0.8125rem",
                            py: 0.25,
                        },
                        "& .MuiChip-root": {
                            height: 20,
                            borderRadius: "7px",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                        },
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Filter fields"
                            placeholder="Search fields"
                            size="small"
                        />
                    )}
                />
            )}

            {filteredHistory.map((item: any, idx) => (
                <Box key={item.id} sx={{ position: 'relative', pl: 3 }}>
                    {/* Vertical Line */}
                    {idx < history.length - 1 && (
                        <Box
                            sx={{
                                position: 'absolute',
                                left: 11,
                                top: 18,
                                bottom: -14,
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
                            p: 1.5,
                            borderRadius: 3,
                            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.75),
                            borderColor: (theme) => alpha(theme.palette.divider, 0.24)
                        }}
                    >
                        {(() => {
                            const fields = item.__filteredFields ?? changedFields(item);
                            const actor = item.user?.name || item.user?.email || "Unknown User";
                            const actionLabel = item.action === 'CREATE'
                                ? `Created by ${actor}`
                                : item.action === 'UPDATE'
                                    ? `${entityType[0]}${entityType.slice(1).toLowerCase()} modified by ${actor}`
                                    : `${item.action} by ${actor}`;
                            return (
                                <>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                            <Typography variant="body2" component="span" sx={{ fontWeight: 800 }}>
                                {actionLabel}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </Typography>
                        </Box>

                        <Typography variant="caption" display="block" color="text.secondary" gutterBottom>
                            by {item.user.name} ({item.user.email})
                        </Typography>

                        {item.action === 'UPDATE' && fields.length > 0 && (
                            <Stack spacing={0.75} sx={{ mt: 1 }}>
                                {fields.map((field: { field: string; before: any; after: any }) => (
                                    <Box key={field.field} sx={{ p: 1, borderRadius: 2, bgcolor: "surfaceContainerLowest", border: "1px solid", borderColor: "divider" }}>
                                        <Typography variant="caption" fontWeight={800} color="text.secondary">
                                            {labelForField(field.field)}
                                        </Typography>
                                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                                            <Chip label={formatValue(field.before, field.field, item)} size="small" variant="outlined" sx={{ maxWidth: 220 }} />
                                            <ArrowIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                                            <Chip label={formatValue(field.after, field.field, item)} size="small" color="success" variant="outlined" sx={{ maxWidth: 220 }} />
                                        </Stack>
                                    </Box>
                                ))}
                            </Stack>
                        )}
                                </>
                            );
                        })()}
                    </Paper>
                </Box>
            ))}
        </Stack>
    );
}

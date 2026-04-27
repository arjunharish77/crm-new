"use client";

import { useState } from "react";
import { Activity } from "@/types/activities";
import { formatDistanceToNow } from "date-fns";
import * as LucideIcons from "lucide-react";
import { ChevronDown, FileText } from "lucide-react";
import {
    alpha,
    Avatar,
    Box,
    Collapse,
    Chip,
    Divider,
    Paper,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { formatWorkspaceDate, formatWorkspaceDateTime, formatWorkspaceTime } from "@/lib/date-format";

interface TimelineProps {
    activities: Activity[];
}

function getDayLabel(date: Date) {
    const today = formatWorkspaceDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateLabel = formatWorkspaceDate(date);
    if (dateLabel === today) return "Today";
    if (dateLabel === formatWorkspaceDate(yesterday)) return "Yesterday";
    return dateLabel;
}

function formatActivityValue(value: unknown): string {
    if (value === null || value === undefined || value === "") {
        return "Not set";
    }

    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }

    if (typeof value === "number") {
        return String(value);
    }

    if (typeof value === "string") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.length ? value.map((item) => formatActivityValue(item)).join(", ") : "Not set";
    }

    return JSON.stringify(value);
}

const ACTIVITY_AUDIT_SKIP_FIELDS = new Set(["tenantId", "objectId", "createdAt", "updatedAt", "deletedAt", "deletedBy", "hash"]);

function activityFieldLabel(field: string) {
    return field
        .replace(/Id$/, "")
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (value) => value.toUpperCase());
}

function humanizeActivityToken(value: string) {
    return value
        .replace(/^stage_/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAuditActivityValue(value: unknown, field: string, event: any) {
    if (value === null || value === undefined || value === "") return "Not set";
    const stringValue = String(value);
    if (field === "typeId") return event.valueLabels?.activityTypes?.[stringValue] || humanizeActivityToken(stringValue);
    if (field === "stageId") return event.valueLabels?.stages?.[stringValue] || humanizeActivityToken(stringValue);
    if (field === "opportunityTypeId") return event.valueLabels?.opportunityTypes?.[stringValue] || humanizeActivityToken(stringValue);
    if (["outcome", "slaStatus", "priority", "status"].includes(field)) return humanizeActivityToken(stringValue);
    return formatActivityValue(value);
}

function activityChangedFields(event: any) {
    if (event.diff && typeof event.diff === "object") {
        return Object.entries(event.diff)
            .filter(([key]) => !ACTIVITY_AUDIT_SKIP_FIELDS.has(key))
            .map(([field, value]: any) => ({ field, before: value?.before, after: value?.after }));
    }

    const before = event.before ?? {};
    const after = event.after ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys]
        .filter((key) => !ACTIVITY_AUDIT_SKIP_FIELDS.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
        .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function Timeline({ activities }: TimelineProps) {
    const theme = useTheme();
    const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);

    const toggleExpanded = (activityId: string) => {
        setExpandedActivityIds((current) =>
            current.includes(activityId)
                ? current.filter((id) => id !== activityId)
                : [...current, activityId]
        );
    };

    if (activities.length === 0) {
        return (
            <Box
                sx={{
                    textAlign: "center",
                    py: 6,
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 4,
                    color: "text.secondary",
                    bgcolor: "surfaceContainerLowest",
                }}
            >
                <FileText size={40} style={{ opacity: 0.18, marginBottom: 12 }} />
                <Typography variant="subtitle1" fontWeight={700}>
                    No activity yet
                </Typography>
                <Typography variant="body2">Activity history will appear here.</Typography>
            </Box>
        );
    }

    const grouped = activities.reduce<Record<string, Activity[]>>((acc, activity) => {
        const key = getDayLabel(new Date(activity.createdAt));
        acc[key] = acc[key] || [];
        acc[key].push(activity);
        return acc;
    }, {});

    return (
        <Stack spacing={3}>
            {Object.entries(grouped).map(([label, items]) => (
                <Box key={label}>
                    <Typography
                        variant="caption"
                        sx={{
                            display: "inline-flex",
                            mb: 1.5,
                            px: 1.25,
                            py: 0.5,
                            borderRadius: 99,
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            color: "primary.main",
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                        }}
                    >
                        {label}
                    </Typography>

                    <Stack spacing={1.25}>
                        {items.map((activity) => {
                            const type = activity.type;
                            const IconComponent = type?.icon
                                ? (LucideIcons as any)[type.icon]
                                : LucideIcons.FileText;
                            const Icon = IconComponent || LucideIcons.FileText;
                            const accent = type?.color || theme.palette.primary.main;
                            const activityDate = new Date(activity.createdAt);
                            const isExpanded = expandedActivityIds.includes(activity.id);
                            const customFieldEntries = Object.entries(activity.customFields ?? {}).filter(
                                ([, value]) => value !== null && value !== undefined && value !== ""
                            );
                            const activityFields = [
                                { label: "Type", value: activity.type?.name ?? "Activity" },
                                { label: "Outcome", value: activity.outcome },
                                { label: "Notes", value: activity.notes },
                                { label: "Due At", value: activity.dueAt ? formatWorkspaceDateTime(activity.dueAt) : null },
                                { label: "Completed At", value: activity.completedAt ? formatWorkspaceDateTime(activity.completedAt) : null },
                                { label: "SLA Status", value: activity.slaStatus },
                                { label: "SLA Target", value: activity.slaTarget ? formatWorkspaceDateTime(activity.slaTarget) : null },
                                { label: "Lead", value: activity.lead?.name },
                                { label: "Opportunity", value: activity.opportunity?.title },
                                { label: "Logged By", value: activity.user ? activity.user.name || activity.user.email : null },
                                { label: "Created", value: formatWorkspaceDateTime(activityDate) },
                                { label: "Updated", value: formatWorkspaceDateTime(activity.updatedAt) },
                                { label: "Recurring", value: activity.isRecurring ? "Yes" : "No" },
                                { label: "Recurrence Rule", value: activity.recurrenceRule },
                            ].filter((field) => field.value !== null && field.value !== undefined && field.value !== "");
                            const expandedFields = [
                                ...activityFields,
                                ...customFieldEntries.map(([key, value]) => ({
                                    label: key,
                                    value,
                                })),
                            ];
                            const auditEvents = (activity.auditEvents ?? []).filter((event) => event.action === "UPDATE" && activityChangedFields(event).length > 0);

                            return (
                                <Paper
                                    key={activity.id}
                                    elevation={0}
                                    onClick={() => toggleExpanded(activity.id)}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 3,
                                        border: "1px solid",
                                        borderColor: alpha(accent, 0.18),
                                        bgcolor: "background.paper",
                                        cursor: "pointer",
                                        transition: "border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
                                        "&:hover": {
                                            borderColor: alpha(accent, 0.28),
                                            boxShadow: `0 10px 28px ${alpha(accent, 0.08)}`,
                                        },
                                    }}
                                >
                                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                        <Box
                                            sx={{
                                                width: 52,
                                                minWidth: 52,
                                                textAlign: "center",
                                                pt: 0.25,
                                            }}
                                        >
                                            <Avatar
                                                sx={{
                                                    width: 32,
                                                    height: 32,
                                                    mx: "auto",
                                                    mb: 0.5,
                                                    bgcolor: alpha(accent, 0.1),
                                                    color: accent,
                                                    border: "1px solid",
                                                    borderColor: alpha(accent, 0.18),
                                                }}
                                            >
                                                <Icon size={14} />
                                            </Avatar>
                                            <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                                                {formatWorkspaceTime(activityDate)}
                                            </Typography>
                                        </Box>

                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Stack
                                                direction={{ xs: "column", sm: "row" }}
                                                spacing={1}
                                                justifyContent="space-between"
                                                alignItems={{ xs: "flex-start", sm: "center" }}
                                                sx={{ mb: 0.75 }}
                                            >
                                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                                                    <Typography variant="body2" fontWeight={800}>
                                                        {activity.type?.name || "Activity"}
                                                    </Typography>
                                                    {activity.outcome && (
                                                        <Chip
                                                            label={activity.outcome}
                                                            size="small"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: "0.65rem",
                                                                fontWeight: 700,
                                                                borderRadius: 1.5,
                                                                bgcolor: "surfaceContainerHighest",
                                                            }}
                                                        />
                                                    )}
                                                    {activity.slaStatus && activity.slaStatus !== "PENDING" && (
                                                        <Chip
                                                            label={activity.slaStatus}
                                                            size="small"
                                                            color={activity.slaStatus === "MET" ? "success" : "error"}
                                                            variant="outlined"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: "0.65rem",
                                                                fontWeight: 700,
                                                                borderRadius: 1.5,
                                                            }}
                                                        />
                                                    )}
                                                </Stack>

                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Typography variant="caption" color="text.secondary">
                                                        {formatDistanceToNow(activityDate, { addSuffix: true })}
                                                    </Typography>
                                                    <Box
                                                        sx={{
                                                            width: 24,
                                                            height: 24,
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            borderRadius: 1.5,
                                                            bgcolor: alpha(accent, 0.08),
                                                            color: accent,
                                                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                                            transition: "transform 160ms ease",
                                                        }}
                                                    >
                                                        <ChevronDown size={14} />
                                                    </Box>
                                                </Stack>
                                            </Stack>

                                            {activity.notes ? (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "text.primary",
                                                        mb: 0.75,
                                                        whiteSpace: "pre-wrap",
                                                        lineHeight: 1.45,
                                                    }}
                                                >
                                                    {activity.notes}
                                                </Typography>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                                                    No notes were added for this activity.
                                                </Typography>
                                            )}

                                            <Stack direction="row" spacing={1.25} flexWrap="wrap">
                                                {activity.lead && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Lead: <strong>{activity.lead.name}</strong>
                                                    </Typography>
                                                )}
                                                {activity.opportunity && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Opportunity: <strong>{activity.opportunity.title}</strong>
                                                    </Typography>
                                                )}
                                                {activity.user && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        by {activity.user.name || activity.user.email}
                                                    </Typography>
                                                )}
                                                {auditEvents.length > 0 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {auditEvents.length} modification{auditEvents.length === 1 ? "" : "s"} tracked
                                                    </Typography>
                                                )}
                                            </Stack>

                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <Divider sx={{ my: 1.25 }} />
                                                {auditEvents.length > 0 && (
                                                    <Stack spacing={1} sx={{ mb: 1.25 }}>
                                                        {auditEvents.map((event) => {
                                                            const changes = activityChangedFields(event);
                                                            const actor = event.user?.name || event.user?.email || "Unknown User";
                                                            return (
                                                                <Box key={event.id} sx={{ p: 1.25, borderRadius: 2, bgcolor: alpha(theme.palette.info.main, 0.06), border: "1px solid", borderColor: alpha(theme.palette.info.main, 0.18) }}>
                                                                    <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "info.main", mb: 0.75 }}>
                                                                        Activity modified by {actor} / {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                                                                    </Typography>
                                                                    <Stack spacing={0.5}>
                                                                        {changes.map((change) => (
                                                                            <Typography key={`${event.id}-${change.field}`} variant="caption" color="text.secondary">
                                                                                <strong>{activityFieldLabel(change.field)}</strong>: {formatAuditActivityValue(change.before, change.field, event)} -&gt; {formatAuditActivityValue(change.after, change.field, event)}
                                                                            </Typography>
                                                                        ))}
                                                                    </Stack>
                                                                </Box>
                                                            );
                                                        })}
                                                    </Stack>
                                                )}
                                                <Stack
                                                    spacing={1}
                                                    sx={{
                                                        display: "grid",
                                                        gridTemplateColumns: {
                                                            xs: "1fr",
                                                            sm: "repeat(2, minmax(0, 1fr))",
                                                        },
                                                        gap: 1,
                                                    }}
                                                >
                                                    {expandedFields.length > 0 ? (
                                                        expandedFields.map((field) => (
                                                            <Box
                                                                key={`${activity.id}-${field.label}`}
                                                                sx={{
                                                                    px: 1.25,
                                                                    py: 1,
                                                                    borderRadius: 2,
                                                                    bgcolor: "surfaceContainerLowest",
                                                                    border: "1px solid",
                                                                    borderColor: "divider",
                                                                }}
                                                            >
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{
                                                                        display: "block",
                                                                        mb: 0.25,
                                                                        color: "text.secondary",
                                                                        fontWeight: 700,
                                                                        letterSpacing: "0.02em",
                                                                        textTransform: "uppercase",
                                                                    }}
                                                                >
                                                                    {field.label}
                                                                </Typography>
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        color: "text.primary",
                                                                        fontWeight: 600,
                                                                        wordBreak: "break-word",
                                                                        whiteSpace: "pre-wrap",
                                                                    }}
                                                                >
                                                                    {formatActivityValue(field.value)}
                                                                </Typography>
                                                            </Box>
                                                        ))
                                                    ) : (
                                                        <Box
                                                            sx={{
                                                                gridColumn: "1 / -1",
                                                                px: 1.25,
                                                                py: 1,
                                                                borderRadius: 2,
                                                                bgcolor: "surfaceContainerLowest",
                                                                border: "1px dashed",
                                                                borderColor: "divider",
                                                            }}
                                                        >
                                                            <Typography variant="body2" color="text.secondary">
                                                                No additional fields were stored for this activity.
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </Stack>
                                            </Collapse>
                                        </Box>
                                    </Stack>
                                </Paper>
                            );
                        })}
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
}
